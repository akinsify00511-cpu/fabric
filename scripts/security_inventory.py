#!/usr/bin/env python3
"""Avenize security inventory — generated from migrations.

Outputs:
  supabase/security/SECURITY_DEFINER_INVENTORY.md — every function, its
    privilege model, caller guard, grants, flags.
  supabase/security/RPC_ATTACK_MATRIX.md — the prioritized adversarial list.

Definitions:
  - SECURITY DEFINER is detected in the function OPTION TAIL (after the body):
      AS $$ ... $$ LANGUAGE plpgsql SECURITY DEFINER SET search_path ...
  - GUARDED: the body references the caller's identity/tenant membership
    (get_current_staff / auth.uid() / is_platform_admin / raw staff check /
    a *_id = auth.uid() comparison / token-based public access by design).
  - Public/token-gated helpers (signing, invites, rate limits, api verify,
    SSO options) are an intentional exception class, tagged PUBLIC_BY_DESIGN.
"""
import re
import glob

OPTION_TAIL_LIMIT = 600

PUBLIC_BY_DESIGN = {
    'accept_invite', 'get_invite_info', 'validate_invite_token',
    'check_auth_rate_limit', 'log_security_event', 'verify_api_key',
    'get_signature_request_by_token', 'mark_signature_viewed',
    'record_signature', 'decline_signature', 'get_sso_login_options',
    'get_pricing_tiers',
}

GUARD_PATTERNS = [
    r'get_current_staff', r'auth\.uid\(\)', r'is_platform_admin',
    r'FROM\s+(public\.)?staff', r'auth\.jwt\(\)',
    r'user_id\s*=\s*auth\.uid\(\)', r'token',  # token-gated public helpers
]

def split_functions(sql):
    funcs = []
    for m in re.finditer(
        r'CREATE\s+OR\s+REPLACE\s+FUNCTION\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\(([^)]*)\)',
        sql, re.IGNORECASE,
    ):
        name, params = m.group(1), m.group(2)
        rest = sql[m.end():]
        as_m = re.search(r'\bAS\s+(\$[\w$]*\$)', rest, re.IGNORECASE)
        if not as_m:
            continue
        tag = as_m.group(1)
        body_start = sql.find(tag, m.end()) + len(tag)
        body_end = sql.find(tag, body_start)
        if body_end == -1:
            continue
        body = sql[body_start:body_end]
        tail = sql[body_end + len(tag): body_end + len(tag) + OPTION_TAIL_LIMIT].split(';')[0]
        funcs.append({'name': name, 'params': params, 'body': body, 'tail': tail,
                      'migration': ''})
    return funcs

def classify(f):
    secdef = bool(re.search(r'SECURITY\s+DEFINER', f['tail'], re.IGNORECASE))
    guarded = any(re.search(p, f['body'], re.IGNORECASE) for p in GUARD_PATTERNS)
    has_bizid = 'business_id' in f['params'].lower()
    sp_safe = bool(re.search(r'search_path', f['tail'], re.IGNORECASE))
    public_ok = f['name'] in PUBLIC_BY_DESIGN
    flags = []
    if secdef and not guarded and not public_ok:
        flags.append('NO_CALLER_GUARD')
    if secdef and has_bizid and not guarded and not public_ok:
        flags.append('BIZID_UNGUARDED')
    if secdef and not sp_safe:
        flags.append('NO_SEARCH_PATH')
    return {'secdef': secdef, 'guarded': guarded, 'has_bizid': has_bizid,
            'sp_safe': sp_safe, 'public_ok': public_ok, 'flags': flags}

def main():
    latest = {}
    filelist = sorted(glob.glob('supabase/migrations/*.sql'))
    for path in filelist:
        sql = open(path, encoding='utf-8', errors='replace').read()
        for f in split_functions(sql):
            key = (f['name'], f['params'])
            f['migration'] = path.split('/')[-1]
            latest[key] = f  # later migrations redefine -> keep the last def

    funcs = list(latest.values())
    for f in funcs:
        f.update(classify(f))

    grants = {}
    revokes = {}
    for path in filelist:
        sql = open(path, encoding='utf-8', errors='replace').read()
        for gm in re.finditer(r'GRANT\s+EXECUTE\s+ON\s+FUNCTION\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\([^)]*\)\s+TO\s+([^;]+);', sql, re.IGNORECASE):
            grants.setdefault(gm.group(1), set()).update(r.strip() for r in gm.group(2).split(','))
        for rm in re.finditer(r'REVOKE\s+EXECUTE\s+ON\s+FUNCTION\s+(?:public\.)?([a-zA-Z_][\w]*)\s*\([^)]*\)\s+FROM\s+([^;]+);', sql, re.IGNORECASE):
            revokes.setdefault(rm.group(1), set()).update(r.strip() for r in rm.group(2).split(','))

    secdef = [f for f in funcs if f['secdef']]
    flagged = [f for f in funcs if f['flags']]
    bizid_unguarded = [f for f in funcs if 'BIZID_UNGUARDED' in f['flags']]

    lines = ['# SECURITY DEFINER Inventory (generated — scripts/security_inventory.py)', '']
    lines.append(f'- Functions scanned (latest definition): **{len(funcs)}**')
    lines.append(f'- SECURITY DEFINER: **{len(secdef)}**')
    lines.append(f'- Public/token-gated by design: **{len(PUBLIC_BY_DESIGN & {f["name"] for f in funcs})}**')
    lines.append(f'- Flagged: **{len(flagged)}** (BIZID_UNGUARDED: **{len(bizid_unguarded)}**)')
    lines.append('')
    lines.append('| Function | Params | DEFINER | Guarded | biz_id | search_path | Grants | Flags |')
    lines.append('|---|---|---|---|---|---|---|---|')
    for f in sorted(funcs, key=lambda x: (x['name'], x['params'])):
        g = sorted(grants.get(f['name'], set()))
        lines.append(
            f"| `{f['name']}` | {f['params'].strip()[:60]} | "
            f"{'YES' if f['secdef'] else ''} | {'yes' if f['guarded'] else 'no'} | "
            f"{'yes' if f['has_bizid'] else ''} | {'yes' if f['sp_safe'] else 'NO'} | "
            f"{', '.join(g) or 'default'} | {', '.join(f['flags']) if f['flags'] else ''} |"
        )
    open('supabase/security/SECURITY_DEFINER_INVENTORY.md', 'w').write('\n'.join(lines) + '\n')

    m = ['# RPC Attack Matrix (generated — scripts/security_inventory.py)', '']
    m.append('Every sensitive RPC must be adversarially tested with: anonymous / wrong tenant / '
             'correct-tenant-wrong-role / removed member / sibling business / null params / '
             'duplicate calls / replay / extreme input. P0 = SECURITY DEFINER + business_id param + '
             'no caller guard (real cross-tenant leak class). P1 = SECURITY DEFINER + no guard.')
    m.append('')
    m.append('| RPC | biz_id param | caller guard | grants | class | priority |')
    m.append('|---|---|---|---|---|---|')
    for f in sorted(secdef, key=lambda x: (x['guarded'], x['name'])):
        g = sorted(grants.get(f['name'], set()))
        if f['public_ok']:
            cls, pri = 'PUBLIC_BY_DESIGN', 'documented'
        elif not f['guarded'] and f['has_bizid']:
            cls, pri = 'BIZID_UNGUARDED', 'P0'
        elif not f['guarded']:
            cls, pri = 'NO_CALLER_GUARD', 'P1'
        else:
            cls, pri = 'guarded', 'P2'
        m.append(f"| `{f['name']}` | {'yes' if f['has_bizid'] else ''} | "
                 f"{'yes' if f['guarded'] else '**NO**'} | {', '.join(g) or 'default'} | {cls} | {pri} |")
    open('supabase/security/RPC_ATTACK_MATRIX.md', 'w').write('\n'.join(m) + '\n')

    print(f'scanned={len(funcs)} secdef={len(secdef)} flagged={len(flagged)} bizid_unguarded={len(bizid_unguarded)}')
    for f in sorted(flagged, key=lambda x: x['name'])[:40]:
        if f['flags'] != ['NO_SEARCH_PATH']:
            print(f"  {','.join(f['flags'])}: {f['name']}")

if __name__ == '__main__':
    main()
