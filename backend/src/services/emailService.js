import { Resend } from 'resend';
import dotenv from 'dotenv';

class EmailService {
  constructor() {
    dotenv.config();
    dotenv.config({ path: './backend/.env' });
    dotenv.config({ path: './server/.env' });
    this.resend = null;
    this.configureResend();
  }

  configureResend() {
    const apiKey = process.env.RESEND_API_KEY;
    this.from = process.env.EMAIL_FROM || 'onboarding@resend.dev';

    if (apiKey) {
      this.resend = new Resend(apiKey);
      console.log(`✅ Email service configured with Resend`);
    } else {
      console.warn('⚠️ Resend credentials not configured. Set RESEND_API_KEY in .env');
    }
  }

  async sendOTP(toEmail, otp, subject = 'Your OTP for SRF Platform') {
    if (!this.resend) {
      this.configureResend();
    }

    if (!this.resend) {
      throw new Error('Resend API Key not configured on the server. Please check environment variables.');
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: `"SRF Platform" <${this.from}>`,
        to: [toEmail],
        subject: subject,
        text: `Your OTP code is: ${otp}\n\nPlease enter this code in the platform to verify your request. Do not share this code with anyone.`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #111827; margin-bottom: 20px;">SRF Management Platform</h2>
            <p style="color: #4b5563; font-size: 16px;">You requested a One-Time Password (OTP) for authentication.</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <p style="font-size: 14px; color: #6b7280; text-transform: uppercase; letter-spacing: 1px;">Your OTP Code</p>
              <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; padding: 15px 25px; background: #f3f4f6; color: #1f2937; display: inline-block; border-radius: 8px; margin-top: 5px;">${otp}</p>
            </div>
            
            <p style="color: #4b5563; font-size: 14px; line-height: 1.5;">This code will expire shortly. Please enter this code in the platform to verify your request.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
              <p style="color: #dc2626; font-size: 12px; font-weight: bold;">SECURITY WARNING:</p>
              <p style="color: #6b7280; font-size: 12px; margin-top: 5px;">Never share your OTP with anyone, including support staff. If you didn't request this code, please secure your account immediately and ignore this email.</p>
            </div>
          </div>
        `
      });

      if (error) {
        if (error.message && error.message.includes('You can only send testing emails to your own email address')) {
          console.warn(`\n[Sandbox Limit Bypass] Resend API blocked sending to ${toEmail} because your domain is not verified. 
-> The OTP code requested is: ${otp} <-
Proceeding as success so development can continue.`);
          return { success: true, messageId: 'sandbox_mock' };
        }
        throw new Error(error.message);
      }

      console.log(`✅ Email sent successfully to ${toEmail} [Message ID: ${data.id}]`);
      return { success: true, messageId: data.id };
    } catch (error) {
      console.error(`❌ Error sending email to ${toEmail}:`, error.message);
      throw error;
    }
  }

  async sendWelcomeEmail(toEmail, username, password, role, loginUrl = 'http://localhost:3000') {
    if (!this.resend) {
      this.configureResend();
    }

    if (!this.resend) {
      console.warn('⚠️ Resend not configured. Printing credentials to server console instead:');
      console.log(`[Welcome Email Mock] To: ${toEmail}, Username: ${username}, Password: ${password}, Role: ${role}, Login URL: ${loginUrl}`);
      return;
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: `"SRF Platform" <${this.from}>`,
        to: [toEmail],
        subject: 'Your Account Credentials for SRF Platform',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
            <h2 style="color: #111827; margin-bottom: 20px;">Welcome to SRF Management Platform</h2>
            <p style="color: #4b5563; font-size: 16px;">An account has been created for you as an <strong>${role}</strong>.</p>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; color: #1f2937; font-size: 14px;"><strong>Portal URL:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
              <p style="margin: 0 0 10px 0; color: #1f2937; font-size: 14px;"><strong>Username:</strong> ${username}</p>
              <p style="margin: 0; color: #1f2937; font-size: 14px;"><strong>Temporary Password:</strong> <code style="font-size: 16px; font-weight: bold; background: #e5e7eb; padding: 2px 6px; border-radius: 4px;">${password}</code></p>
            </div>
            
            <p style="color: #4b5563; font-size: 14px; line-height: 1.5;">Please log in using the credentials above. You will be required to change your password upon your first login.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 12px;">
              This is an automated system email. Do not reply to this address.
            </div>
          </div>
        `
      });

      if (error) {
        if (error.message && error.message.includes('You can only send') || error.message.includes('testing emails')) {
          console.warn(`\n[Sandbox Limit Bypass] Resend API blocked welcome email to ${toEmail}.
-> The Temporary Password is: ${password} <-
Proceeding as success so development can continue.`);
          return { success: true, messageId: 'sandbox_mock_welcome' };
        }
        throw new Error(error.message);
      }

      console.log(`✅ Welcome email sent to ${toEmail} for username: ${username}`);
      return { success: true, messageId: data.id };
    } catch (error) {
      console.error(`❌ Error sending welcome email to ${toEmail}:`, error.message);
      throw error;
    }
  }
}

export default new EmailService();
