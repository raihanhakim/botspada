import axios from 'axios';
import dotenv from 'dotenv';
import { logError } from './database.js';

dotenv.config();

const TELE_TOKEN = process.env.TELE_TOKEN;
const BASE_URL = `https://api.telegram.org/bot${TELE_TOKEN}`;

const commandCooldowns = new Map();
const COOLDOWN_MS = 2000;

export async function sendTele(chatId, text, options = {}) {
    try {
        await axios.post(`${BASE_URL}/sendMessage`, {
            chat_id: chatId,
            text: text,
            parse_mode: options.parse_mode || 'Markdown',
            ...options
        });
    } catch (error) {
        logError(`Telegram send error to ${chatId}`, error);
    }
}

export async function sendPhoto(chatId, photoUrl, caption = '', options = {}) {
    try {
        await axios.post(`${BASE_URL}/sendPhoto`, {
            chat_id: chatId,
            photo: photoUrl,
            caption: caption,
            parse_mode: options.parse_mode || 'Markdown',
            ...options
        });
    } catch (error) {
        logError(`Telegram send photo error to ${chatId}`, error);
    }
}

export function createMainKeyboard() {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: '📊 Status', callback_data: 'cmd_status' },
                    { text: '✅ Cek Absen', callback_data: 'cmd_cek' }
                ],
                [
                    { text: '📅 Jadwal', callback_data: 'cmd_jadwal' },
                    { text: '📈 History', callback_data: 'cmd_history' }
                ],
                [
                    { text: '🔮 Prediksi', callback_data: 'cmd_predict' },
                    { text: '🌪️ Sapu Jagat', callback_data: 'cmd_sapujagat' }
                ],
                [
                    { text: '💰 Bayar', callback_data: 'cmd_bayar' },
                    { text: 'ℹ️ Help', callback_data: 'cmd_help' }
                ]
            ]
        }
    };
}

export async function answerCallback(callbackQueryId, text = '') {
    try {
        await axios.post(`${BASE_URL}/answerCallbackQuery`, {
            callback_query_id: callbackQueryId,
            text: text
        });
    } catch (error) {
        logError('Callback answer error', error);
    }
}

export function checkCooldown(chatId, command) {
    const key = `${chatId}_${command}`;
    const now = Date.now();
    const lastUsed = commandCooldowns.get(key);

    if (lastUsed && (now - lastUsed) < COOLDOWN_MS) {
        return false;
    }

    commandCooldowns.set(key, now);
    return true;
}

export async function sendTeleWithKeyboard(chatId, text, keyboard) {
    try {
        await axios.post(`${BASE_URL}/sendMessage`, {
            chat_id: chatId,
            text: text,
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: keyboard
            }
        });
    } catch (error) {
        logError(`Telegram send keyboard error to ${chatId}`, error);
    }
}

export async function getUpdates(offset) {
    try {
        const res = await axios.get(`${BASE_URL}/getUpdates`, {
            params: { offset, timeout: 5 }
        });
        return res.data.result;
    } catch (error) {
        logError('Error getting updates', error);
        return [];
    }
}
