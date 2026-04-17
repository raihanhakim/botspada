import axios from 'axios';
import dotenv from 'dotenv';
import { logError, logInfo } from './database.js';

dotenv.config();

const PAKASIR_API_KEY = process.env.PAKASIR_API_KEY;
const PAKASIR_PROJECT = process.env.PAKASIR_PROJECT;
const BASE_URL = 'https://app.pakasir.com/api';

export async function createPayment(orderId, amount, method = 'qris') {
    try {
        // Log untuk debugging
        logInfo(`Creating payment: project=${PAKASIR_PROJECT}, order_id=${orderId}, amount=${amount}, method=${method}`);

        const response = await axios.post(`${BASE_URL}/transactioncreate/${method}`, {
            project: PAKASIR_PROJECT,
            order_id: orderId,
            amount: amount,
            api_key: PAKASIR_API_KEY
        }, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        logInfo(`Payment created: ${orderId} - ${amount} - ${method}`);
        logInfo(`Pakasir response: ${JSON.stringify(response.data)}`);
        return {
            success: true,
            data: response.data
        };
    } catch (error) {
        logError(`Error creating payment ${orderId}`, error);
        return {
            success: false,
            error: error.response?.data || error.message
        };
    }
}

export async function checkPaymentStatus(orderId, amount) {
    try {
        const response = await axios.get(`${BASE_URL}/transactiondetail`, {
            params: {
                project: PAKASIR_PROJECT,
                order_id: orderId,
                amount: amount,
                api_key: PAKASIR_API_KEY
            }
        });

        return {
            success: true,
            data: response.data
        };
    } catch (error) {
        logError(`Error checking payment status ${orderId}`, error);
        return {
            success: false,
            error: error.response?.data || error.message
        };
    }
}

export async function cancelPayment(orderId, amount) {
    try {
        const response = await axios.post(`${BASE_URL}/transactioncancel`, {
            project: PAKASIR_PROJECT,
            order_id: orderId,
            amount: amount,
            api_key: PAKASIR_API_KEY
        });

        logInfo(`Payment cancelled: ${orderId}`);
        return {
            success: true,
            data: response.data
        };
    } catch (error) {
        logError(`Error cancelling payment ${orderId}`, error);
        return {
            success: false,
            error: error.response?.data || error.message
        };
    }
}

export function generateOrderId(nim) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const nimShort = nim.slice(-4);
    return `BOT${nimShort}${timestamp}`;
}
