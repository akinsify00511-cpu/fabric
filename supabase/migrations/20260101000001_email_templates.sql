-- ============================================
-- AVENIZE EMAIL TEMPLATES
-- Customizable welcome and invite emails
-- ============================================

-- Email templates table for customizable messages
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES businesses(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL CHECK (template_type IN ('welcome_owner', 'welcome_staff', 'invite')),
  subject TEXT NOT NULL DEFAULT 'Welcome to Avenize',
  heading TEXT,
  body TEXT NOT NULL,
  cta_text TEXT DEFAULT 'Get Started',
  cta_url TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(business_id, template_type)
);

-- Insert default Avenize branded templates
INSERT INTO email_templates (template_type, subject, heading, body, cta_text, is_default) VALUES
(
  'welcome_owner',
  'Welcome to Avenize — Your Business OS',
  'Welcome to Avenize, {{staff_name}}! 🎉',
  E'<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n</head>\n<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#F7F7F5;">\n  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">\n    <div style="background:white;border-radius:16px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">\n      <div style="text-align:center;margin-bottom:32px;">\n        <div style="width:48px;height:48px;background:linear-gradient(135deg,#2563EB,#4F46E5,#8B5CF6);border-radius:12px;display:inline-block;"></div>\n        <h1 style="margin:16px 0 0;font-size:28px;font-weight:700;color:#111;">Avenize</h1>\n      </div>\n      <h2 style="margin:0 0 24px;font-size:24px;font-weight:600;color:#111;">{{heading}}</h2>\n      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#444;">\n        Your business, {{business_name}}, is now set up and ready to go. You''re the owner of this workspace, which means you can invite your team, configure settings, and manage everything.\n      </p>\n      <p style="margin:0 0 32px;font-size:16px;line-height:1.6;color:#444;">\n        With Avenize, you can track jobs, manage inventory, handle invoicing, and coordinate your team — all in one place. No more switching between WhatsApp, Excel, and multiple apps.\n      </p>\n      <div style="text-align:center;margin-bottom:32px;">\n        <a href="{{cta_url}}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#2563EB,#4F46E5);color:white;text-decoration:none;border-radius:12px;font-weight:600;font-size:16px;">{{cta_text}}</a>\n      </div>\n      <hr style="border:none;border-top:1px solid #E8E8E8;margin:32px 0;">\n      <p style="margin:0;font-size:14px;color:#888;">\n        Questions? Reply to this email or visit our help center.\n      </p>\n    </div>\n    <p style="text-align:center;margin:24px 0 0;font-size:12px;color:#AAA;">\n      © 2026 Avenize, Inc. — The Business Operating System\n    </p>\n  </div>\n</body>\n</html>',
  'Launch Avenize',
  TRUE
),
(
  'welcome_staff',
  'You''ve joined {{business_name}} on Avenize',
  'Welcome to {{business_name}}, {{staff_name}}! 👋',
  E'<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n</head>\n<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#F7F7F5;">\n  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">\n    <div style="background:white;border-radius:16px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">\n      <div style="text-align:center;margin-bottom:32px;">\n        <div style="width:48px;height:48px;background:linear-gradient(135deg,#2563EB,#4F46E5,#8B5CF6);border-radius:12px;display:inline-block;"></div>\n        <h1 style="margin:16px 0 0;font-size:28px;font-weight:700;color:#111;">Avenize</h1>\n      </div>\n      <h2 style="margin:0 0 24px;font-size:24px;font-weight:600;color:#111;">{{heading}}</h2>\n      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#444;">\n        {{invited_by}} has invited you to join <strong>{{business_name}}</strong> as a <strong>{{role}}</strong> on Avenize.\n      </p>\n      <p style="margin:0 0 32px;font-size:16px;line-height:1.6;color:#444;">\n        Avenize is your company''s operating system — where teams coordinate, jobs get tracked, and everything works together.\n      </p>\n      <div style="text-align:center;margin-bottom:32px;">\n        <a href="{{cta_url}}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#2563EB,#4F46E5);color:white;text-decoration:none;border-radius:12px;font-weight:600;font-size:16px;">{{cta_text}}</a>\n      </div>\n      <hr style="border:none;border-top:1px solid #E8E8E8;margin:32px 0;">\n      <p style="margin:0;font-size:14px;color:#888;">\n        Questions? Reply to this email or contact your team admin.\n      </p>\n    </div>\n    <p style="text-align:center;margin:24px 0 0;font-size:12px;color:#AAA;">\n      © 2026 Avenize, Inc. — The Business Operating System\n    </p>\n  </div>\n</body>\n</html>',
  'Get Started',
  TRUE
),
(
  'invite',
  'You''re invited to join {{business_name}} on Avenize',
  'You''re invited to join {{business_name}}! 🎉',
  E'<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n</head>\n<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,''Segoe UI'',Roboto,sans-serif;background:#F7F7F5;">\n  <div style="max-width:600px;margin:0 auto;padding:40px 20px;">\n    <div style="background:white;border-radius:16px;padding:40px;box-shadow:0 2px 8px rgba(0,0,0,0.06);">\n      <div style="text-align:center;margin-bottom:32px;">\n        <div style="width:48px;height:48px;background:linear-gradient(135deg,#2563EB,#4F46E5,#8B5CF6);border-radius:12px;display:inline-block;"></div>\n        <h1 style="margin:16px 0 0;font-size:28px;font-weight:700;color:#111;">Avenize</h1>\n      </div>\n      <h2 style="margin:0 0 24px;font-size:24px;font-weight:600;color:#111;">{{heading}}</h2>\n      <p style="margin:0 0 20px;font-size:16px;line-height:1.6;color:#444;">\n        {{invited_by}} has invited you to join <strong>{{business_name}}</strong> as a <strong>{{role}}</strong>.\n      </p>\n      <p style="margin:0 0 32px;font-size:16px;line-height:1.6;color:#444;">\n        Avenize connects your team, tracks your work, and keeps everything organized — all in one place.\n      </p>\n      <div style="text-align:center;margin-bottom:32px;">\n        <a href="{{cta_url}}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#2563EB,#4F46E5);color:white;text-decoration:none;border-radius:12px;font-weight:600;font-size:16px;">{{cta_text}}</a>\n      </div>\n      <p style="margin:0;font-size:14px;color:#666;background:#F7F7F5;padding:16px;border-radius:8px;">\n        This invitation expires in 7 days. If you didn''t expect this email, you can safely ignore it.\n      </p>\n    </div>\n    <p style="text-align:center;margin:24px 0 0;font-size:12px;color:#AAA;">\n      © 2026 Avenize, Inc. — The Business Operating System\n    </p>\n  </div>\n</body>\n</html>',
  'Accept Invitation',
  TRUE
);

-- Function to get email template with variable replacement
CREATE OR REPLACE FUNCTION get_email_template(
  p_business_id UUID,
  p_template_type TEXT
)
RETURNS TABLE (
  id UUID,
  subject TEXT,
  heading TEXT,
  body TEXT,
  cta_text TEXT,
  cta_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    et.id,
    et.subject,
    et.heading,
    et.body,
    et.cta_text,
    et.cta_url
  FROM email_templates et
  WHERE (et.business_id = p_business_id OR et.is_default = TRUE)
    AND et.template_type = p_template_type
  ORDER BY CASE WHEN et.business_id = p_business_id THEN 0 ELSE 1 END
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update email template
CREATE OR REPLACE FUNCTION update_email_template(
  p_business_id UUID,
  p_template_type TEXT,
  p_subject TEXT,
  p_heading TEXT,
  p_body TEXT,
  p_cta_text TEXT,
  p_cta_url TEXT
)
RETURNS email_templates AS $$
DECLARE
  v_template email_templates;
BEGIN
  UPDATE email_templates
  SET 
    subject = COALESCE(p_subject, subject),
    heading = COALESCE(p_heading, heading),
    body = COALESCE(p_body, body),
    cta_text = COALESCE(p_cta_text, cta_text),
    cta_url = COALESCE(p_cta_url, cta_url),
    updated_at = now()
  WHERE business_id = p_business_id AND template_type = p_template_type
  RETURNING * INTO v_template;
  
  IF v_template IS NULL THEN
    INSERT INTO email_templates (business_id, template_type, subject, heading, body, cta_text, cta_url)
    VALUES (p_business_id, p_template_type, p_subject, p_heading, p_body, p_cta_text, p_cta_url)
    RETURNING * INTO v_template;
  END IF;
  
  RETURN v_template;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS
ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Business owners can manage email templates"
  ON email_templates FOR ALL
  TO authenticated
  USING (
    business_id IN (
      SELECT s.business_id FROM staff s 
      WHERE s.user_id = auth.uid() 
      AND s.role IN ('owner', 'manager')
    )
  );

CREATE POLICY "Anyone can read default templates"
  ON email_templates FOR SELECT
  TO authenticated
  USING (is_default = TRUE);
