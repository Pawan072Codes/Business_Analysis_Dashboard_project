import os
import urllib.parse
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel, EmailStr

from routes.auth import get_current_user
from services.gmail_service import (
    is_google_oauth_configured,
    create_authorization_url,
    exchange_code_and_store_credentials,
    get_user_gmail_status,
    disconnect_user_gmail,
    send_user_gmail_message
)

router = APIRouter()


class TestEmailRequest(BaseModel):
    recipient: Optional[EmailStr] = None


@router.get("/gmail/status")
def gmail_status(current_user: dict = Depends(get_current_user)):
    """
    Returns connection and configuration status of the current user's personal Gmail integration.
    """
    user_id = current_user["id"]
    status_info = get_user_gmail_status(user_id)
    return {
        "success": True,
        "user_id": user_id,
        "username": current_user.get("username"),
        **status_info
    }


@router.get("/gmail/connect")
def gmail_connect(current_user: dict = Depends(get_current_user)):
    """
    Initiates Google OAuth 2.0 flow for the authenticated user.
    Returns the Google consent screen URL with a cryptographically secure CSRF state token.
    """
    if not is_google_oauth_configured():
        raise HTTPException(
            status_code=400,
            detail=(
                "Google OAuth 2.0 credentials are not configured on the server. "
                "Please configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your backend .env file."
            )
        )

    user_id = current_user["id"]
    try:
        auth_url, state = create_authorization_url(user_id)
        return {
            "success": True,
            "authorization_url": auth_url,
            "state": state
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate authorization URL: {str(e)}")


@router.get("/gmail/callback")
def gmail_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None)
):
    """
    Handles Google OAuth redirect callback.
    Validates CSRF state, exchanges authorization code for tokens,
    associates the Gmail account with the authenticated user, and closes popup or redirects.
    """
    if error:
        err_msg = urllib.parse.quote(f"Google authorization cancelled or denied: {error}")
        return RedirectResponse(url=f"/settings.html?gmail_error={err_msg}")

    if not code or not state:
        err_msg = urllib.parse.quote("Missing required OAuth parameters (code or state).")
        return RedirectResponse(url=f"/settings.html?gmail_error={err_msg}")

    try:
        result = exchange_code_and_store_credentials(code=code, state=state)
        google_email = result.get("google_email", "")
        safe_email = urllib.parse.quote(google_email)

        # Return a smart HTML bridge that notifies popup opener or redirects parent
        html_content = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Gmail Connected - BizVision</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #0f172a;
            color: #f8fafc;
        }}
        .card {{
            background: #1e293b;
            border: 1px solid #334155;
            border-radius: 12px;
            padding: 32px;
            text-align: center;
            max-width: 440px;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5);
        }}
        .icon {{ font-size: 48px; margin-bottom: 16px; }}
        h2 {{ margin: 0 0 10px; font-size: 20px; color: #10b981; }}
        p {{ color: #cbd5e1; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }}
        .email-badge {{
            display: inline-block;
            background: rgba(16, 185, 129, 0.15);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.3);
            padding: 6px 14px;
            border-radius: 20px;
            font-weight: 600;
            font-size: 13.5px;
            margin-bottom: 20px;
        }}
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">✅</div>
        <h2>Gmail Connected Successfully!</h2>
        <div class="email-badge">{google_email}</div>
        <p>Your personal Gmail is now linked to your BizVision workspace. Closing window and returning to settings...</p>
    </div>
    <script>
        (function() {{
            try {{
                if (window.opener && !window.opener.closed) {{
                    window.opener.postMessage({{
                        type: 'GMAIL_CONNECTED',
                        email: '{google_email}'
                    }}, '*');
                    setTimeout(function() {{ window.close(); }}, 800);
                    return;
                }}
            }} catch(e) {{
                console.warn('Could not postMessage to opener:', e);
            }}
            setTimeout(function() {{
                window.location.href = '/settings.html?gmail_connected=1&email={safe_email}';
            }}, 1000);
        }})();
    </script>
</body>
</html>"""
        return HTMLResponse(content=html_content, status_code=200)

    except Exception as e:
        safe_err = urllib.parse.quote(str(e))
        html_error = f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Connection Failed - BizVision</title>
    <style>
        body {{
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: #0f172a;
            color: #f8fafc;
        }}
        .card {{
            background: #1e293b;
            border: 1px solid #ef4444;
            border-radius: 12px;
            padding: 32px;
            text-align: center;
            max-width: 440px;
        }}
        .icon {{ font-size: 48px; margin-bottom: 16px; }}
        h2 {{ margin: 0 0 10px; font-size: 20px; color: #ef4444; }}
        p {{ color: #cbd5e1; font-size: 14px; line-height: 1.5; margin: 0 0 20px; }}
        a {{ color: #60a5fa; text-decoration: none; font-weight: 600; }}
    </style>
</head>
<body>
    <div class="card">
        <div class="icon">❌</div>
        <h2>Connection Failed</h2>
        <p>{str(e)}</p>
        <p><a href="/settings.html">Return to Settings</a></p>
    </div>
    <script>
        try {{
            if (window.opener && !window.opener.closed) {{
                window.opener.postMessage({{
                    type: 'GMAIL_ERROR',
                    error: '{str(e)}'
                }}, '*');
            }}
        }} catch(e) {{}}
    </script>
</body>
</html>"""
        return HTMLResponse(content=html_error, status_code=400)


@router.post("/gmail/disconnect")
def gmail_disconnect(current_user: dict = Depends(get_current_user)):
    """
    Disconnects the user's personal Gmail integration and purges stored tokens.
    """
    user_id = current_user["id"]
    success, msg = disconnect_user_gmail(user_id)
    return {"success": success, "message": msg}


@router.post("/gmail/test-email")
def send_test_email(
    payload: TestEmailRequest = None,
    current_user: dict = Depends(get_current_user)
):
    """
    Sends a test verification email via the user's connected Gmail account
    to confirm outbound delivery capability.
    """
    user_id = current_user["id"]
    status_info = get_user_gmail_status(user_id)

    if not status_info["connected"] or not status_info["google_email"]:
        raise HTTPException(
            status_code=400,
            detail="No Gmail account connected. Please connect your Gmail account in Settings first."
        )

    sender_email = status_info["google_email"]
    recipient = (payload and payload.recipient) or sender_email

    subject = f"BizVision Gmail Integration Verification - {current_user.get('username', 'User')}"
    body = (
        f"Hello {current_user.get('username', 'there')},\n\n"
        f"Congratulations! Your personal Gmail account ({sender_email}) has been successfully connected "
        f"to your BizVision Analytics workspace.\n\n"
        f"• Connected Sender: {sender_email}\n"
        f"• Workspace User: {current_user.get('username')}\n"
        f"• Time: {status_info.get('updated_at') or 'Just now'}\n"
        f"• Scope: https://www.googleapis.com/auth/gmail.send\n\n"
        f"When you send business analytics reports, they will be delivered directly from your Gmail account.\n\n"
        f"Best regards,\nBizVision Analytics Engine"
    )

    success, msg, from_addr = send_user_gmail_message(
        user_id=user_id,
        to_email=recipient,
        subject=subject,
        body_text=body
    )

    if not success:
        raise HTTPException(status_code=400, detail=msg)

    return {
        "success": True,
        "message": f"Verification email successfully sent to {recipient} from your connected Gmail ({from_addr})",
        "sender": from_addr,
        "recipient": recipient
    }
