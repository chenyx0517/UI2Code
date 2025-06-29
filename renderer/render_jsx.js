// Playwright 替代 Puppeteer
const { chromium } = require('playwright'); // 引入 chromium 浏览器，您也可以选择 firefox 或 webkit
const fs = require('fs');
const path = require('path');
const Babel = require('@babel/standalone');
const sass = require('sass'); // 引入 sass 库
const http = require('http'); // 新增：引入 Node.js 的 'http' 模块
const url = require('url');   // 新增：引入 Node.js 的 'url' 模块用于路径解析

// 命令行参数顺序：<output_path_for_screenshot> <jsx_code_base64> <scss_code_base64>
const outputPath = process.argv[2]; // 截图的最终保存路径
const jsxCodeBase64 = process.argv[3];
const scssCodeBase64 = process.argv[4];

// 解析输出文件路径，用于保存调试 HTML 和日志
const outputDir = path.dirname(outputPath);
const itemBaseName = path.basename(outputPath, '.png'); // 通常是 rendered_screenshot

const browserLogFilePath = path.join(outputDir, `${itemBaseName}_browser_log.txt`);
const errorLogFilePath = path.join(outputDir, `${itemBaseName}_error_log.txt`); // 专门的错误日志文件

// 创建一个写入流，用于捕获所有浏览器控制台和页面错误日志
const browserLogStream = fs.createWriteStream(browserLogFilePath, { flags: 'w' });

// 立即记录日志，确保即使在极早期的崩溃也能捕获
function logToBoth(message, isError = false) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] ${message}`;
    if (isError) {
        console.error(formattedMessage);
    } else {
        console.log(formattedMessage); // <--- 修复：将 formattedFormattedMessage 改为 formattedMessage
    }
    browserLogStream.write(formattedMessage + '\n');
    if (isError) {
        fs.appendFileSync(errorLogFilePath, formattedMessage + '\n', 'utf8'); // 错误也写入专门的错误文件
    }
}

// 辅助函数：用于本地 HTTP 服务器提供静态文件
function serveStaticFile(filePath, res, logFn) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            logFn(`Server Error (readFile): ${err.message} for ${filePath}`, true);
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        // 简化的 MIME 类型映射，可根据需要扩展
        const contentType = {
            '.html': 'text/html',
            '.css': 'text/css',
            '.js': 'application/javascript',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.svg': 'image/svg+xml',
            '.json': 'application/json'
        }[ext] || 'application/octet-stream'; // 默认为二进制流
        
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(data);
    });
}


logToBoth(`🚀 Playwright 渲染脚本开始执行。浏览器日志将写入: ${browserLogFilePath}`);

const jsxCode = Buffer.from(jsxCodeBase64, 'base64').toString('utf8');
const scssCode = scssCodeBase64 ? Buffer.from(scssCodeBase64, 'base64').toString('utf8') : '';

async function renderAndScreenshot() {
    let browser;
    let server; // 声明服务器变量
    try {
        // Playwright 不需要手动指定 executablePath，它会管理下载的浏览器
        logToBoth(`尝试启动 Playwright 浏览器 (Chromium, headless: false)...`);
        browser = await chromium.launch({ 
            headless: false, // 保持为 false，以便您看到浏览器窗口进行调试
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-gpu',
                '--disable-dev-shm-usage',
                '--disable-web-security', // 禁用 Web 安全，对于本地文件非常重要
                '--allow-insecure-localhost',
                '--ignore-certificate-errors',
            ]
        });
        logToBoth(`✅ Playwright 浏览器已成功启动。`);
        
        const page = await browser.newPage();
        await page.setViewportSize({ width: 780, height: 1760 });
        logToBoth(`✅ 已创建新页面并设置视口。`);

        // 捕获所有页面错误和控制台日志
        page.on('pageerror', error => {
            const logMsg = `❌ 浏览器页面错误 (运行时 JS 错误): ${error.message}\n堆栈: ${error.stack}`;
            logToBoth(logMsg, true);
        });
        page.on('console', async message => {
            const args = await Promise.all(message.args().map(arg => arg.jsonValue()));
            const logMsg = `浏览器控制台 [${message.type()}]: ${args.join(' ')}`;
            logToBoth(logMsg);
            if (message.type() === 'error') {
                logToBoth(`❌ 浏览器控制台错误: ${args.join(' ')}`, true);
            }
        });
        page.on('close', () => { 
            logToBoth('⚠️ 警告: Playwright 页面已关闭。', true);
        });
        // 捕获浏览器断开连接事件
        browser.on('disconnected', () => {
            logToBoth('💥 Playwright 浏览器连接已断开！这可能意味着浏览器崩溃。', true);
            browserLogStream.end(); 
        });
        // 捕获浏览器内部的进程错误
        browser.on('browsererror', error => { 
            logToBoth(`🔥 Playwright 浏览器进程错误: ${error.message}`, true);
            browserLogStream.end();
        });
        page.on('load', () => { 
            logToBoth('✅ Playwright 页面 DOMContentLoaded 或 Load 事件触发。');
        });

        // --- 网络请求监听器以捕获图片加载状态 ---
        page.on('request', request => {
            // 仅记录 http(s) 请求，file:// 请求已不再是主要方式
            if (request.url().startsWith('http') && (request.resourceType() === 'image' || request.url().includes('assets/'))) { 
                logToBoth(`➡️ 请求资源: ${request.url()} (类型: ${request.resourceType()})`);
            }
        });
        page.on('response', async response => {
            const request = response.request();
            if (request.url().startsWith('http') && (request.resourceType() === 'image' || request.url().includes('assets/'))) { 
                const status = response.status();
                const responseUrl = response.url(); // 使用 responseUrl 来避免与 Node.js url 模块混淆
                if (status >= 200 && status < 300) {
                    logToBoth(`✅ 资源加载成功: ${responseUrl} (类型: ${request.resourceType()}, 状态码: ${status})`);
                } else {
                    logToBoth(`❌ 资源加载失败: ${responseUrl} (类型: ${request.resourceType()}, 状态码: ${status})`, true);
                }
            }
        });
        page.on('requestfailed', request => {
            if (request.url().startsWith('http') && (request.resourceType() === 'image' || request.url().includes('assets/'))) { 
                logToBoth(`❌ 资源请求失败 (Request Failed): ${request.url()} 错误: ${request.failure()?.errorText || '未知错误'}`, true); 
            }
        });
        // --- END NETWORK LISTENERS ---

        logToBoth(`开始编译 SCSS...`);
        // 1. 编译 SCSS 为 CSS
        let compiledCss = '';
        if (scssCode) {
            try {
                let processedScss = scssCode.replace(/(\d+)\s*dx/g, '$1px'); 
                // 确保 SCSS 中的图片路径也是相对的，因为它们将通过 HTTP 服务器提供
                processedScss = processedScss.replace(/\.\.\/img\//g, './assets/'); 

                const result = sass.compileString(processedScss); 
                compiledCss = result.css.toString();
                logToBoth('SCSS 编译成功。');
            } catch (sassError) {
                logToBoth(`❌ SCSS 编译错误: ${sassError.message}`, true);
                compiledCss = `/* SCSS Compilation Error: ${sassError.message} */ body { background-color: #ffe0e0; padding: 20px; font-family: sans-serif; } #root::before { content: "SCSS ERROR: ${sassError.message.replace(/"/g, "'").replace(/\n/g, '\\A')}"; color: red; display: block; white-space: pre-wrap; word-wrap: break-word; }`;
            }
        }
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_received_style.scss`), scssCode, 'utf8');
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_compiled_style.css`), compiledCss, 'utf8');
        logToBoth(`SCSS 编译结果已保存。`);
        logToBoth('--- 编译后的完整 CSS 内容开始 ---');
        logToBoth(compiledCss);
        logToBoth('--- 编译后的完整 CSS 内容结束 ---');


        logToBoth(`开始编译 JSX...`);
        // 2. 编译 JSX 为纯 JavaScript
        let compiledJsx;
        let componentName = 'App'; 
        try {
            // 确保 JSX 中的图片路径也是相对的
            let processedJsxCode = jsxCode.replace(/\.\.\/img\//g, './assets/');

            compiledJsx = Babel.transform(processedJsxCode, { 
                plugins: [
                    ['transform-react-jsx', { pragma: 'React.createElement' }], 
                ],
            }).code;

            compiledJsx = compiledJsx.replace(/^import(?:["'].*?['']|.*?;)?\n?/gm, ''); 
            compiledJsx = compiledJsx.replace(/export (default )?.*;?\n?/g, ''); 

            const componentNameMatch = compiledJsx.match(/(?:function|class)\s+([A-Z][a-zA-Z0-9]*)\s*(?:\(|extends)/);
            if (componentNameMatch && componentNameMatch[1]) {
                componentName = componentNameMatch[1];
                logToBoth(`找到主组件名: ${componentName}`);
            } else {
                const topLevelVarMatch = compiledJsx.match(/const\s+([A-Z][a-zA-Z0-9]*)\s*=/);
                if (topLevelVarMatch && topLevelVarMatch[1]) {
                    componentName = topLevelVarMatch[1];
                    logToBoth(`找到顶层组件变量: ${componentName}`);
                } else {
                    logToBoth('未能可靠地提取组件名。默认为 "App"。', true);
                }
            }
            
            compiledJsx += `\nwindow.App = ${componentName};`; 
            compiledJsx = `'use strict';\n${compiledJsx}`;

            logToBoth('JSX 编译成功。');
        } catch (babelError) {
            logToBoth(`❌ Babel 编译 JSX 错误: ${babelError.message}`, true);
            await page.setContent(`<html><body><div style="color: red; padding: 20px;">错误：编译 JSX 失败: ${babelError.message}</div></body></html>`);
            await page.screenshot({ path: outputPath });
            return;
        }
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_received_code.jsx`), jsxCode, 'utf8');
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_compiled_code.js`), compiledJsx, 'utf8');
        logToBoth(`JSX 编译结果已保存。`);

        logToBoth(`开始构建 HTML 内容...`);

        // 3. 构建 HTML 页面
        // 注意：这里的 background-image URL 将使用相对路径，因为将通过 HTTP 服务器提供
        const htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Generated Page</title>
                <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
                <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
                
                <!-- 注入编译后的 CSS -->
                <style id="generated-style">
                    html, body {
                        height: 100%; /* Ensure html and body take full height */
                        min-height: 100vh; /* Ensure full viewport height */
                        margin: 0;
                        padding: 0;
                    }
                    body { 
                        background-image: url("./assets/bg.jpg"); /* <-- MODIFIED: Reverted to relative URL */
                        background-size: cover;
                        background-position: center;
                        background-repeat: no-repeat;
                    }
                    ${compiledCss}
                </style>
            </head>
            <body>
                <div id="root" style="min-height: 100vh;"></div>
                <script type="text/javascript">
                    ${compiledJsx}

                    console.log('尝试渲染组件...');
                    try {
                        if (typeof window.App === 'function') {
                            console.log('找到组件: window.App. 尝试渲染...');
                            ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(window.App));
                            console.log('React 组件渲染成功。');
                        } else {
                            const errorMsg = "编译后无法找到 'window.App' React 组件。请检查 compiled_code.js。";
                            console.error('❌', errorMsg);
                            document.getElementById('root').innerHTML = '<div style="color: red; padding: 20px;">组件未找到错误: ' + errorMsg + '</div>';
                        }
                    } catch (renderError) {
                        console.error("❌ 浏览器上下文中 React 渲染错误:", renderError.message);
                        document.getElementById('root').innerHTML = '<div style="color: red; padding: 20px;">React 渲染错误: ' + renderError.message + '</div>';
                    }
                </script>
            </body>
            </html>
        `;
        logToBoth(`HTML 内容已构建。`);
        
        // --- MODIFIED: 启动本地 HTTP 服务器 ---
        const serverPort = 8080; // 您可以根据需要更改此端口

        server = http.createServer((req, res) => {
            const parsedUrl = url.parse(req.url);
            let requestPath = parsedUrl.pathname;
            
            // 移除开头的斜杠，并处理可能的根目录请求
            if (requestPath.startsWith('/')) {
                requestPath = requestPath.substring(1);
            }
            
            const filePath = path.join(outputDir, requestPath); // 从 outputDir 提供文件

            logToBoth(`Server Request: ${req.url} -> 尝试提供文件: ${filePath}`);

            fs.stat(filePath, (err, stats) => {
                if (err) {
                    logToBoth(`Server Error (stat): ${err.message} for ${filePath}`, true);
                    res.writeHead(404, { 'Content-Type': 'text/plain' });
                    res.end('404 Not Found');
                    return;
                }

                if (stats.isDirectory()) {
                    // 如果是目录，尝试提供 index.html
                    const indexFilePath = path.join(filePath, 'index.html');
                    fs.access(indexFilePath, fs.constants.F_OK, (err) => {
                        if (err) {
                            logToBoth(`Server Error (access index.html): ${err.message} for ${indexFilePath}`, true);
                            res.writeHead(403, { 'Content-Type': 'text/plain' });
                            res.end('403 Forbidden');
                        } else {
                            serveStaticFile(indexFilePath, res, logToBoth);
                        }
                    });
                } else {
                    serveStaticFile(filePath, res, logToBoth);
                }
            });
        });

        await new Promise((resolve, reject) => {
            server.listen(serverPort, (err) => {
                if (err) {
                    logToBoth(`❌ 本地 HTTP 服务器启动失败: ${err.message}`, true);
                    return reject(err);
                }
                logToBoth(`✅ 本地 HTTP 服务器已在 http://localhost:${serverPort} 启动`);
                resolve();
            });
        });
        // --- 结束启动本地 HTTP 服务器 ---

        // 将 HTML 内容写入临时文件，供服务器提供
        const tempHtmlFileName = `${itemBaseName}_served_page.html`;
        const tempHtmlFilePath = path.join(outputDir, tempHtmlFileName);
        fs.writeFileSync(tempHtmlFilePath, htmlContent, 'utf8');
        logToBoth(`临时 HTML 文件已保存到 ${tempHtmlFilePath}`);

        // 现在让 Playwright 导航到 HTTP URL
        const pageUrl = `http://localhost:${serverPort}/${tempHtmlFileName}`;
        await page.goto(pageUrl, { waitUntil: 'networkidle' });
        logToBoth(`✅ Playwright 已导航到 ${pageUrl}`);
        
        logToBoth('检查 body 元素的 background-image 样式...');
        const backgroundImage = await page.evaluate(() => {
            const body = document.querySelector('body');
            if (body) {
                const computedStyle = window.getComputedStyle(body);
                return computedStyle.getPropertyValue('background-image');
            }
            return 'body element not found or no background-image.';
        });
        logToBoth(`<body> 元素的 background-image 计算样式: ${backgroundImage}`);

        logToBoth('检查 HTML 中 <style> 标签的实际内容...');
        const styleTagContent = await page.evaluate(() => {
            const styleTag = document.getElementById('generated-style'); 
            return styleTag ? styleTag.textContent : 'Style tag with ID "generated-style" not found.';
        });
        logToBoth('--- <style> 标签内容开始 ---');
        logToBoth(styleTagContent);
        logToBoth('--- <style> 标签内容结束 ---');

        logToBoth('为图片加载后的渲染额外添加 3 秒延迟...'); 
        await page.waitForTimeout(3000); 
        logToBoth('额外延迟结束。');

        logToBoth('开始获取页面最终渲染的 DOM...');
        const pageContent = await page.content();
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_final_rendered_dom.html`), pageContent, 'utf8');
        logToBoth('页面渲染 HTML 已保存。');

        const rootContent = await page.evaluate(() => document.getElementById('root') ? document.getElementById('root').innerHTML : 'N/A');
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_root_inner_html.html`), rootContent, 'utf8');
        logToBoth('#root 元素内容已保存。');

        logToBoth('开始截图...');
        await page.screenshot({ path: outputPath, fullPage: true });
        logToBoth(`✅ 截图已保存到 ${outputPath}`);

        // --- 保持浏览器打开更长时间，以便手动调试 ---
        logToBoth(`\n✅ Playwright 浏览器已启动并渲染页面。`);
        logToBoth(`请手动检查浏览器窗口并打开开发者工具 (F12) 进行调试。`);
        logToBoth(`**浏览器将在 2 分钟后自动关闭。在此之前请手动关闭此 Chrome 窗口以完成脚本。**`);
        await page.waitForTimeout(120000); // 保持浏览器打开 2 分钟

    } catch (error) {
        const errorMsg = `❌ Playwright 或通用渲染错误 (浏览器上下文之外): ${error.message}\n堆栈: ${error.stack}`;
        logToBoth(errorMsg, true);

        if (browser && !browser.isClosed()) { 
            try {
                const pageText = await browser.pages()[0]?.evaluate(() => document.body.innerText); 
                if (pageText) {
                    logToBoth(`浏览器端捕获到页面文本 (崩溃前尝试): \n${pageText.substring(0, 500)}...`, true);
                }
            } catch (innerError) {
                logToBoth(`❌ 尝试获取浏览器崩溃前内容时出错: ${innerError.message}`, true);
            }
            await browser.close(); 
        } else if (browser) { 
             logToBoth('浏览器已断开连接或已关闭，无法在错误中操作页面。', true);
        } else { 
            logToBoth('浏览器未能启动。', true);
        }
        
        try {
            const tempBrowser = await chromium.launch({ headless: true });
            const tempPage = await tempBrowser.newPage();
            await tempPage.setContent(`<div style="color: red; padding: 20px;">全局错误: ${error.message}<br>堆栈: ${error.stack}</div>`);
            await tempPage.screenshot({ path: outputPath });
            await tempBrowser.close();
            logToBoth(`错误截图已保存到 ${outputPath}`);
        } catch (screenshotError) {
            logToBoth(`❌ 无法保存错误截图: ${screenshotError.message}`, true);
        }
    } finally {
        if (browser && !browser.isClosed()) { 
            await browser.close();
        }
        if (server) { // 确保服务器在 finally 块中被关闭
            logToBoth('关闭本地 HTTP 服务器...');
            await new Promise(resolve => server.close(() => {
                logToBoth('✅ 本地 HTTP 服务器已关闭。');
                resolve();
            }));
        }
        browserLogStream.end(); 
        logToBoth(`脚本执行结束。`); 
    }
}

renderAndScreenshot();
