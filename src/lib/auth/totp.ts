import { authenticator } from "otplib";
import QRCode from "qrcode";
import { encrypt, decrypt } from "../crypto";

authenticator.options = { window: 1 };

export function newTotpSecret() {
  return authenticator.generateSecret();
}
export function totpUri(email: string, secret: string) {
  return authenticator.keyuri(email, "StitchWorks", secret);
}
export async function totpQrDataUrl(email: string, secret: string) {
  return QRCode.toDataURL(totpUri(email, secret));
}
export function verifyTotp(token: string, secret: string) {
  return authenticator.check(token.replace(/\s/g, ""), secret);
}
export function sealSecret(s: string) {
  return encrypt(s);
}
export function openSecret(s: string) {
  return decrypt(s);
}
