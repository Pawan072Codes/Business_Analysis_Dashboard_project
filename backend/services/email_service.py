import os
import smtplib
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.application import MIMEApplication
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv()

# Setup guide:
# 1. Enable 2-Step Verification on your Google account.
# 2. Go to Google Account -> Security -> App Passwords.
# 3. Create a new App Password for "Mail".
# 4. Set the following environment variables in .env:
#    SMTP_SERVER=smtp.gmail.com
#    SMTP_PORT=587
#    SMTP_USER=your_email@gmail.com
#    SMTP_PASSWORD=your_16_digit_app_password
#    SENDER_EMAIL=your_email@gmail.com

SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
SMTP_USER = os.getenv("SMTP_USER", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
SENDER_EMAIL = os.getenv("SENDER_EMAIL", os.getenv("SMTP_USER", ""))


def send_email(
    to_email: str,
    subject: str,
    body: str,
    attachment_bytes: bytes = None,
    attachment_filename: str = None
) -> tuple[bool, str]:
    """
    Sends an email with optional attachment.
    Handles failures gracefully so main application workflows are not interrupted.
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        warning_msg = "SMTP credentials not configured in .env. Skipping email delivery."
        return False, warning_msg

    try:
        msg = MIMEMultipart()
        msg["From"] = SENDER_EMAIL
        msg["To"] = to_email
        msg["Subject"] = subject

        msg.attach(MIMEText(body, "plain"))

        if attachment_bytes and attachment_filename:
            part = MIMEApplication(attachment_bytes, Name=attachment_filename)
            part["Content-Disposition"] = f'attachment; filename="{attachment_filename}"'
            msg.attach(part)

        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)

        return True, "Email sent successfully"
    except Exception as e:
        error_msg = f"Failed to send email: {str(e)}"
        logger.warning("Email sending failed: %s", e)
        return False, error_msg
