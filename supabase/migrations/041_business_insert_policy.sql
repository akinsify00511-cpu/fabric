-- ============================================
-- COMPLETE DATABASE SETUP FOR ONBOARDING
-- Creates all necessary tables and sets up permissions
-- ============================================

-- Step 1: Create businesses table if not exists
CREATE TABLE IF NOT EXISTS businesses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    industry TEXT,
    plan TEXT DEFAULT 'free',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 2: Create staff table if not exists
CREATE TABLE IF NOT EXISTS staff (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'staff',
    job_title TEXT,
    department TEXT,
    phone TEXT,
    avatar_url TEXT,
    onboarding_completed BOOLEAN DEFAULT FALSE,
    is_beta_tester BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(business_id, user_id)
);

-- Step 3: Create business_branding table if not exists
CREATE TABLE IF NOT EXISTS business_branding (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
    background_color TEXT DEFAULT '#FFFFFF',
    text_color TEXT DEFAULT '#111827',
    accent_color TEXT DEFAULT '#2563EB',
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Step 4: Create user_xp table (referenced in errors)
CREATE TABLE IF NOT EXISTS user_xp (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    achievements JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id)
);

-- Step 5: Drop ALL existing policies
DROP POLICY IF EXISTS "Users see own business" ON businesses;
DROP POLICY IF EXISTS "Staff see same business" ON staff;
DROP POLICY IF EXISTS "Owners/managers can manage staff" ON staff;
DROP POLICY IF EXISTS "Authenticated users can create businesses" ON businesses;
DROP POLICY IF EXISTS "Authenticated users can create staff" ON staff;
DROP POLICY IF EXISTS "Authenticated users can create branding" ON business_branding;
DROP POLICY IF EXISTS "Businesses insert" ON businesses;
DROP POLICY IF EXISTS "Staff insert" ON staff;
DROP POLICY IF EXISTS "Branding insert" ON business_branding;

-- Step 6: Disable RLS
ALTER TABLE businesses DISABLE ROW LEVEL SECURITY;
ALTER TABLE staff DISABLE ROW LEVEL SECURITY;
ALTER TABLE business_branding DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_xp DISABLE ROW LEVEL SECURITY;

-- Step 7: Grant ALL permissions
GRANT ALL ON businesses TO postgres, anon, authenticated, service_role;
GRANT ALL ON staff TO postgres, anon, authenticated, service_role;
GRANT ALL ON business_branding TO postgres, anon, authenticated, service_role;
GRANT ALL ON user_xp TO postgres, anon, authenticated, service_role;

-- Step 8: Re-enable RLS
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_branding ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_xp ENABLE ROW LEVEL SECURITY;

-- Step 9: Create PERMISSIVE policies (drop first if exists)
DROP POLICY IF EXISTS "Allow all on businesses" ON businesses;
DROP POLICY IF EXISTS "Allow all on staff" ON staff;
DROP POLICY IF EXISTS "Allow all on branding" ON business_branding;
DROP POLICY IF EXISTS "Allow all on user_xp" ON user_xp;

CREATE POLICY "Allow all on businesses" ON businesses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on staff" ON staff FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on branding" ON business_branding FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on user_xp" ON user_xp FOR ALL USING (true) WITH CHECK (true);
