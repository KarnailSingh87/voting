import { initWhatsApp, getQRCode } from './backend/config/whatsappService.js';
import mongoose from 'mongoose';

async function test() {
  console.log('Starting WA test...');
  await initWhatsApp();
  console.log('initWhatsApp finished');
  console.log('QR Code:', getQRCode() ? 'Generated' : 'Null');
  process.exit(0);
}
test();
