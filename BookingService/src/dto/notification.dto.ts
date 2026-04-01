export interface NotificationDto {
    to: string; //email address of recipient
    subject: string; // subject of the email
    templateId: string; // ID of email template to use
    params: Record<string, any>; // parameters to replace in template
}