import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

class EmailService {
  constructor() {
    dotenv.config();
    dotenv.config({ path: './backend/.env' });
    dotenv.config({ path: './server/.env' });
    this.transporter = null;
    this.configureTransporter();
  }

  configureTransporter() {
    this.user = process.env.GMAIL_USER || process.env.SMTP_USER;
    this.pass = process.env.GMAIL_APP_PASSWORD || process.env.SMTP_PASS;
    this.from = process.env.EMAIL_FROM || this.user;

    if (this.user && this.pass) {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: this.user,
          pass: this.pass,
        }
      });
      console.log(`✅ Email service configured with Gmail (${this.user})`);
    } else {
      console.warn('⚠️ Gmail credentials not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD in .env');
    }
  }

  async sendOTP(toEmail, otp, subject = 'Your OTP for SRF Platform') {
    if (!this.transporter) {
      this.configureTransporter();
    }

    if (!this.transporter) {
      throw new Error('SMTP not configured on the server. Please check environment variables.');
    }

    const mailOptions = {
      from: `"SRF Platform" <${this.from}>`,
      to: toEmail,
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
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Email sent successfully to ${toEmail} [Message ID: ${info.messageId}]`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`❌ Error sending email to ${toEmail}:`, error.message);
      throw error;
    }
  }

  async sendWelcomeEmail(toEmail, username, password, role, loginUrl = 'http://localhost:3000') {
    if (!this.transporter) {
      this.configureTransporter();
    }

    if (!this.transporter) {
      console.warn('⚠️ SMTP not configured. Printing credentials to server console instead:');
      console.log(`[Welcome Email Mock] To: ${toEmail}, Username: ${username}, Password: ${password}, Role: ${role}, Login URL: ${loginUrl}`);
      return;
    }

    const mailOptions = {
      from: `"SRF Platform" <${this.from}>`,
      to: toEmail,
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
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`✅ Welcome email sent to ${toEmail} for username: ${username}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error(`❌ Error sending welcome email to ${toEmail}:`, error.message);
      throw error;
    }
  }
}

export default new EmailService();
