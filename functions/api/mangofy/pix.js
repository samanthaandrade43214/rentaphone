import { handlePaymentRequest } from "./billet.js";

export async function onRequestPost(context) {
  return handlePaymentRequest(context, "pix");
}
