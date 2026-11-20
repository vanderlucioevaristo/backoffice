-- Configuração de envio de e-mails transacionais por empresa (Resend API e Webhook)
ALTER TABLE empresas ADD COLUMN email_notificacoes_ativo INTEGER NOT NULL DEFAULT 1;
ALTER TABLE empresas ADD COLUMN resend_api_key TEXT;
ALTER TABLE empresas ADD COLUMN email_remetente TEXT DEFAULT 'onboarding@resend.dev';
ALTER TABLE empresas ADD COLUMN email_webhook_url TEXT;
