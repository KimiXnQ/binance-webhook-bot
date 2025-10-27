const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// 从环境变量读取配置
const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_SECRET_KEY = process.env.BINANCE_SECRET_KEY;
const BINANCE_BASE_URL = 'https://fapi.binance.com';

// 生成API签名
function generateSignature(queryString) {
    return crypto.createHmac('sha256', BINANCE_SECRET_KEY).update(queryString).digest('hex');
}

// 发送请求到币安
async function binanceRequest(endpoint, params, method = 'POST') {
    const timestamp = Date.now();
    let queryString = Object.entries({ ...params, timestamp })
        .map(([key, value]) => `${key}=${value}`)
        .join('&');
    
    const signature = generateSignature(queryString);
    queryString += `&signature=${signature}`;
    
    const url = `${BINANCE_BASE_URL}${endpoint}?${queryString}`;
    
    console.log('发送请求到币安:', url);
    
    try {
        const response = await fetch(url, {
            method,
            headers: {
                'X-MBX-APIKEY': BINANCE_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        console.log('币安响应:', data);
        return data;
    } catch (error) {
        console.error('请求错误:', error);
        throw error;
    }
}

// 处理交易信号
async function handleTradingSignal(signal) {
    console.log('📡 收到交易信号:', JSON.stringify(signal, null, 2));
    
    if (!signal.symbol) {
        console.error('❌ 错误: 缺少交易对信息');
        return;
    }

    // 清理交易对名称
    let symbol = signal.symbol;
    symbol = symbol.replace('BINANCE:', '');
    symbol = symbol.replace('.P', '');
    if (!symbol.endsWith('USDT')) {
        symbol += 'USDT';
    }
    
    const quantity = parseInt(signal.quantity) || 1;
    
    try {
        switch(signal.action) {
            case 'OPEN_LONG':
                console.log('🚀 执行开多操作...');
                // 开多仓
                const longResult = await binanceRequest('/fapi/v1/order', {
                    symbol: symbol,
                    side: 'BUY',
                    type: 'MARKET',
                    quantity: quantity
                });
                console.log('✅ 多单开仓结果:', longResult);
                
                // 设置止损
                if (signal.stop_loss) {
                    const stopResult = await binanceRequest('/fapi/v1/order', {
                        symbol: symbol,
                        side: 'SELL',
                        type: 'STOP_MARKET',
                        quantity: quantity,
                        stopPrice: parseFloat(signal.stop_loss),
                        workingType: 'MARK_PRICE'
                    });
                    console.log('✅ 多单止损设置结果:', stopResult);
                }
                break;
                
            case 'OPEN_SHORT':
                console.log('📉 执行开空操作...');
                // 开空仓
                const shortResult = await binanceRequest('/fapi/v1/order', {
                    symbol: symbol,
                    side: 'SELL',
                    type: 'MARKET',
                    quantity: quantity
                });
                console.log('✅ 空单开仓结果:', shortResult);
                
                // 设置止损
                if (signal.stop_loss) {
                    const stopResult = await binanceRequest('/fapi/v1/order', {
                        symbol: symbol,
                        side: 'BUY',
                        type: 'STOP_MARKET',
                        quantity: quantity,
                        stopPrice: parseFloat(signal.stop_loss),
                        workingType: 'MARK_PRICE'
                    });
                    console.log('✅ 空单止损设置结果:', stopResult);
                }
                break;
                
            case 'CLOSE_LONG':
                console.log('🏁 执行平多操作...');
                const closeLongResult = await binanceRequest('/fapi/v1/order', {
                    symbol: symbol,
                    side: 'SELL',
                    type: 'MARKET',
                    quantity: quantity
                });
                console.log('✅ 平多结果:', closeLongResult);
                break;
                
            case 'CLOSE_SHORT':
                console.log('🏁 执行平空操作...');
                const closeShortResult = await binanceRequest('/fapi/v1/order', {
                    symbol: symbol,
                    side: 'BUY',
                    type: 'MARKET',
                    quantity: quantity
                });
                console.log('✅ 平空结果:', closeShortResult);
                break;
                
            default:
                console.log('❓ 未知操作:', signal.action);
        }
        console.log('🎉 交易执行完成');
    } catch (error) {
        console.error('❌ 交易执行失败:', error);
    }
}

// Webhook接收端点
app.post('/webhook', async (req, res) => {
    console.log('📍 收到Webhook请求', new Date().toISOString());
    try {
        await handleTradingSignal(req.body);
        res.status(200).json({ 
            status: 'success', 
            message: '信号处理完成',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('❌ Webhook处理错误:', error);
        res.status(500).json({ 
            status: 'error', 
            message: error.message 
        });
    }
});

// 健康检查端点
app.get('/', (req, res) => {
    res.json({ 
        status: 'running', 
        service: 'Binance Webhook Bot',
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// 获取环境信息（调试用）
app.get('/env', (req, res) => {
    res.json({
        has_api_key: !!BINANCE_API_KEY,
        has_secret_key: !!BINANCE_SECRET_KEY,
        node_env: process.env.NODE_ENV
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log('🎉 ==================================');
    console.log('🚀 Webhook服务器启动成功!');
    console.log(`📍 端口: ${PORT}`);
    console.log(`⏰ 时间: ${new Date().toISOString()}`);
    console.log('🎉 ==================================');
});