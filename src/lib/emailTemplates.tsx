// Email templates for Avenize
// These templates are used for generating HTML emails

export const baseStyles = `
  body {
    margin: 0;
    padding: 0;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background-color: #f5f5f5;
  }
  .email-container {
    max-width: 600px;
    margin: 0 auto;
    background-color: #ffffff;
  }
  .email-header {
    background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
    padding: 32px;
    text-align: center;
  }
  .email-header h1 {
    color: #ffffff;
    font-size: 24px;
    font-weight: 600;
    margin: 0;
  }
  .email-header p {
    color: rgba(255, 255, 255, 0.8);
    font-size: 14px;
    margin: 8px 0 0 0;
  }
  .email-body {
    padding: 32px;
  }
  .email-body h2 {
    color: #111827;
    font-size: 20px;
    font-weight: 600;
    margin: 0 0 16px 0;
  }
  .email-body p {
    color: #4b5563;
    font-size: 15px;
    line-height: 1.6;
    margin: 0 0 16px 0;
  }
  .email-body .highlight {
    background-color: #eef2ff;
    padding: 16px;
    border-radius: 8px;
    margin: 24px 0;
  }
  .email-button {
    display: inline-block;
    background: linear-gradient(135deg, #4F46E5 0%, #7C3AED 100%);
    color: #ffffff !important;
    text-decoration: none;
    padding: 14px 28px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 15px;
    margin: 24px 0;
  }
  .email-button:hover {
    opacity: 0.9;
  }
  .email-footer {
    background-color: #f9fafb;
    padding: 24px 32px;
    text-align: center;
    border-top: 1px solid #e5e7eb;
  }
  .email-footer p {
    color: #9ca3af;
    font-size: 12px;
    margin: 0 0 8px 0;
  }
  .email-footer a {
    color: #4F46E5;
    text-decoration: none;
  }
  .code-block {
    background-color: #1f2937;
    color: #ffffff;
    padding: 16px;
    border-radius: 8px;
    font-family: monospace;
    font-size: 18px;
    text-align: center;
    letter-spacing: 4px;
    margin: 16px 0;
  }
  .warning {
    background-color: #fef3c7;
    border-left: 4px solid #f59e0b;
    padding: 16px;
    margin: 16px 0;
  }
  .warning p {
    margin: 0;
    color: #92400e;
  }
  .feature-list {
    margin: 16px 0;
    padding: 0;
    list-style: none;
  }
  .feature-list li {
    display: flex;
    align-items: flex-start;
    margin: 12px 0;
    color: #4b5563;
    font-size: 15px;
  }
  .feature-list li svg {
    margin-right: 12px;
    color: #10b981;
    flex-shrink: 0;
    margin-top: 2px;
  }
`

// Welcome Email Template
export function getWelcomeEmailTemplate(data: {
  name: string
  businessName: string
  loginUrl: string
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to Avenize</title>
</head>
<body style="${baseStyles}">
  <div class="email-container">
    <div class="email-header">
      <h1>Welcome to Avenize</h1>
      <p>The Business Operating System</p>
    </div>
    
    <div class="email-body">
      <h2>Hi ${data.name}! 🎉</h2>
      
      <p>
        Congratulations! Your business <strong>${data.businessName}</strong> is now set up and ready to go.
        You've taken the first step toward unifying all your business operations in one beautiful platform.
      </p>
      
      <div class="highlight">
        <p style="margin: 0; font-weight: 500;">Here's what you can do with Avenize:</p>
        <ul class="feature-list">
          <li>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span><strong>CRM</strong> - Manage customers, deals, and pipeline</span>
          </li>
          <li>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span><strong>Projects</strong> - Track tasks, timelines, and deliverables</span>
          </li>
          <li>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span><strong>Finance</strong> - Invoices, expenses, and cash flow</span>
          </li>
          <li>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
            </svg>
            <span><strong>Team</strong> - Collaborate with your team seamlessly</span>
          </li>
        </ul>
      </div>
      
      <p style="text-align: center;">
        <a href="${data.loginUrl}" class="email-button">Get Started →</a>
      </p>
      
      <p>
        If you have any questions, our support team is here to help. Just reply to this email
        or visit our <a href="${data.loginUrl}/knowledge">Help Center</a>.
      </p>
      
      <p style="margin-top: 24px;">
        Best regards,<br>
        <strong>The Avenize Team</strong>
      </p>
    </div>
    
    <div class="email-footer">
      <p>© 2026 Avenize, Inc. All rights reserved.</p>
      <p>
        <a href="#">Privacy Policy</a> · 
        <a href="#">Terms of Service</a> · 
        <a href="#">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>
`
}

// Email Verification Template
export function getVerificationEmailTemplate(data: {
  name: string
  email: string
  verificationUrl: string
  businessName: string
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm your email</title>
</head>
<body style="${baseStyles}">
  <div class="email-container">
    <div class="email-header">
      <h1>Confirm Your Email</h1>
      <p>Avenize</p>
    </div>
    
    <div class="email-body">
      <h2>Hi ${data.name}!</h2>
      
      <p>
        Thank you for signing up for Avenize. Please confirm your email address by clicking the button below.
      </p>
      
      <div style="text-align: center;">
        <a href="${data.verificationUrl}" class="email-button">Confirm Email Address</a>
      </div>
      
      <p style="text-align: center; color: #6b7280; font-size: 13px;">
        This link will expire in 24 hours.
      </p>
      
      <div class="warning">
        <p>
          <strong>Didn't request this?</strong> If you didn't create an account with Avenize,
          you can safely ignore this email. Someone else may have entered your email by mistake.
        </p>
      </div>
      
      <p>
        If you're having trouble clicking the button, copy and paste this URL into your browser:
      </p>
      
      <p style="font-size: 12px; word-break: break-all; color: #6b7280;">
        ${data.verificationUrl}
      </p>
    </div>
    
    <div class="email-footer">
      <p>© 2026 Avenize, Inc. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`
}

// Forgot Password Template
export function getForgotPasswordEmailTemplate(data: {
  name: string
  resetUrl: string
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset your password</title>
</head>
<body style="${baseStyles}">
  <div class="email-container">
    <div class="email-header">
      <h1>Reset Your Password</h1>
      <p>Avenize</p>
    </div>
    
    <div class="email-body">
      <h2>Hi ${data.name}!</h2>
      
      <p>
        We received a request to reset your password. Click the button below to create a new password.
      </p>
      
      <div style="text-align: center;">
        <a href="${data.resetUrl}" class="email-button">Reset Password</a>
      </div>
      
      <p style="text-align: center; color: #6b7280; font-size: 13px;">
        This link will expire in 1 hour.
      </p>
      
      <div class="warning">
        <p>
          <strong>Didn't request this?</strong> If you didn't request a password reset,
          please ignore this email or contact support if you have concerns about your account security.
        </p>
      </div>
      
      <p>
        For security reasons, this request was received from an unrecognized device. 
        If this wasn't you, please contact us immediately.
      </p>
    </div>
    
    <div class="email-footer">
      <p>© 2026 Avenize, Inc. All rights reserved.</p>
      <p>
        <a href="#">Privacy Policy</a> · 
        <a href="#">Terms of Service</a>
      </p>
    </div>
  </div>
</body>
</html>
`
}

// Invoice Email Template
export function getInvoiceEmailTemplate(data: {
  customerName: string
  customerEmail: string
  invoiceNumber: string
  amount: string
  dueDate: string
  items: Array<{ description: string; amount: string }>
  businessName: string
  businessAddress: string
  payUrl: string
}) {
  const itemsHtml = data.items.map(item => `
    <tr>
      <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb;">${item.description}</td>
      <td style="padding: 12px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${item.amount}</td>
    </tr>
  `).join('')

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${data.invoiceNumber}</title>
</head>
<body style="${baseStyles}">
  <div class="email-container">
    <div class="email-header">
      <h1>Invoice</h1>
      <p>${data.businessName}</p>
    </div>
    
    <div class="email-body">
      <div style="display: flex; justify-content: space-between; margin-bottom: 24px;">
        <div>
          <p style="font-weight: 600; margin: 0;">Invoice ${data.invoiceNumber}</p>
          <p style="color: #6b7280; margin: 4px 0 0 0; font-size: 14px;">
            Due Date: ${data.dueDate}
          </p>
        </div>
        <div style="text-align: right;">
          <p style="font-weight: 600; margin: 0;">Amount Due</p>
          <p style="font-size: 24px; font-weight: 700; color: #4F46E5; margin: 4px 0 0 0;">
            ${data.amount}
          </p>
        </div>
      </div>
      
      <p>Dear ${data.customerName},</p>
      
      <p>Please find attached the invoice for your recent purchase. You can pay online using the button below.</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 24px 0;">
        ${itemsHtml}
        <tr>
          <td style="padding: 16px 0; font-weight: 600;">Total</td>
          <td style="padding: 16px 0; font-weight: 600; text-align: right;">${data.amount}</td>
        </tr>
      </table>
      
      <div style="text-align: center;">
        <a href="${data.payUrl}" class="email-button">Pay Now →</a>
      </div>
      
      <p style="margin-top: 32px; font-size: 13px; color: #6b7280;">
        ${data.businessAddress}
      </p>
    </div>
    
    <div class="email-footer">
      <p>© 2026 Avenize, Inc. All rights reserved.</p>
      <p>
        Questions about this invoice? Contact us at billing@avenize.com
      </p>
    </div>
  </div>
</body>
</html>
`
}

// Two-Factor Authentication Code Template
export function getTwoFactorCodeEmailTemplate(data: {
  name: string
  code: string
  ipAddress: string
  location: string
}) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your verification code</title>
</head>
<body style="${baseStyles}">
  <div class="email-container">
    <div class="email-header">
      <h1>Verification Code</h1>
      <p>Avenize</p>
    </div>
    
    <div class="email-body">
      <h2>Hi ${data.name}!</h2>
      
      <p>
        You requested to sign in to your Avenize account. Enter the following code to continue:
      </p>
      
      <div class="code-block">${data.code}</div>
      
      <p style="text-align: center; color: #6b7280; font-size: 13px;">
        This code expires in 10 minutes.
      </p>
      
      <div class="warning">
        <p>
          <strong>Security Notice:</strong><br>
          ${data.location ? `Location: ${data.location}<br>` : ''}
          ${data.ipAddress ? `IP Address: ${data.ipAddress}` : ''}
        </p>
      </div>
      
      <p>
        If you didn't request this code, your account may be compromised. Please change your password immediately
        and contact support if you have concerns.
      </p>
    </div>
    
    <div class="email-footer">
      <p>© 2026 Avenize, Inc. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
`
}
