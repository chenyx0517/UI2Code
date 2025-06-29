const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const Babel = require('@babel/standalone');
const sass = require('sass'); // 引入 sass 库

// 命令行参数顺序：<output_path_for_screenshot> <jsx_code_base64> <scss_code_base64>
const outputPath = process.argv[2]; // 截图的最终保存路径
const jsxCodeBase64 = process.argv[3];
const scssCodeBase64 = process.argv[4];

// 解析输出文件路径，用于保存调试 HTML
const outputDir = path.dirname(outputPath);
const itemBaseName = path.basename(outputPath, '.png'); // 通常是 rendered_screenshot

const jsxCode = Buffer.from(jsxCodeBase64, 'base64').toString('utf8');
const scssCode = scssCodeBase64 ? Buffer.from(scssCodeBase64, 'base64').toString('utf8') : '';

async function renderAndScreenshot() {
    let browser;
    try {
        // --- 核心：手动指定 Chromium 可执行路径 ---
        // 请替换为您的 chrome.exe 实际路径！
        // 例如: 'D:/study/UI2Code/browsers/chrome-win64/chrome.exe'
        const CHROME_EXECUTABLE_PATH = 'D:\\study\\chrome-win64\\chrome.exe'; // <-- 请在这里粘贴您在文件资源管理器中得到的精确路径！
        
        // 在启动 puppeteer 之前，先检查文件是否存在，如果不存在就报错并退出
        if (!fs.existsSync(CHROME_EXECUTABLE_PATH)) {
            console.error(`❌ 错误: 未找到 Chrome 可执行文件。请检查路径: ${CHROME_EXECUTABLE_PATH}`);
            // 保存错误截图以显示明确的错误信息
            await (async () => {
                let tempBrowser;
                try {
                    tempBrowser = await puppeteer.launch({headless: true});
                    const tempPage = await tempBrowser.newPage();
                    await tempPage.setContent(`<div style="color: red; padding: 20px;">ERROR: Chrome executable not found at:<br>${CHROME_EXECUTABLE_PATH}</div>`);
                    await tempPage.screenshot({path: outputPath});
                } catch (tempLaunchError) {
                    console.error('❌ 无法启动临时浏览器进行错误截图:', tempLaunchError.message);
                } finally {
                    if (tempBrowser) await tempBrowser.close();
                }
            })();
            // 写入错误日志文件
            fs.writeFileSync(path.join(outputDir, `${itemBaseName}_error_log.txt`), `Error: Chrome executable not found at ${CHROME_EXECUTABLE_PATH}`, 'utf8');
            return;
        }

        browser = await puppeteer.launch({
            headless: true, // 无头模式，浏览器在后台运行
            executablePath: CHROME_EXECUTABLE_PATH, // <-- 强制使用手动指定的路径
            ignoreDefaultArgs: ['--disable-extensions'], // 忽略默认的一些参数，避免冲突
            args: [
                '--no-sandbox',             // 禁用沙箱，对于某些环境必须
                '--disable-setuid-sandbox', // 禁用 setuid 沙箱
                '--disable-gpu',            // 禁用 GPU 硬件加速，避免兼容性问题
                '--disable-dev-shm-usage',  // 禁用 /dev/shm 使用，避免内存不足问题
                '--no-zygote',              // 避免在某些 Linux 系统上出现问题
                '--single-process',         // 使用单进程模式，减少资源消耗，可能更稳定
                '--disable-web-security',   // 禁用 Web 安全，如果加载本地文件或跨域内容可能需要
                '--allow-insecure-localhost' // 允许不安全的 localhost 连接
            ]
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // 设置页面错误监听器，捕获浏览器内部的未捕获错误
        page.on('pageerror', error => {
            console.error('❌ Browser page error (runtime JS error):', error.message);
        });
        // 捕获浏览器控制台的日志
        page.on('console', message => {
            console.log(`Browser console ${message.type()}: ${message.text()}`);
            if (message.type() === 'error') {
                console.error(`❌ Browser console error: ${message.text()}`);
            }
        });


        // 1. 编译 SCSS 为 CSS
        let compiledCss = '';
        if (scssCode) {
            try {
                // --- 关键修复：替换 SCSS 中的非标准单位 'dx' 为 'px' ---
                let processedScss = scssCode.replace(/(\d+)\s*dx/g, '$1px'); // 修正正则表达式，处理 '10dx' 和 '10 dx'
                
                // --- 关键修改：替换 SCSS 中的图片路径 from ../img/ 到 ./assets/ ---
                // 因为 HTML 文件在 item_id 目录下，图片在 item_id/assets 目录下
                processedScss = processedScss.replace(/\.\.\/img\//g, './assets/'); 

                const result = sass.compileString(processedScss); // <-- 确保这里使用了 processedScss
                compiledCss = result.css.toString();
                console.log('SCSS compiled successfully (first 500 chars):', compiledCss.substring(0, 500));
            } catch (sassError) {
                console.error('❌ SCSS compilation error:', sassError.message);
                compiledCss = `/* SCSS Compilation Error: ${sassError.message} */ body { background-color: #ffe0e0; padding: 20px; font-family: sans-serif; } #root::before { content: "SCSS ERROR: ${sassError.message.replace(/"/g, "'").replace(/\n/g, '\\A')}"; color: red; display: block; white-space: pre-wrap; word-wrap: break-word; }`;
            }
        }
        // 保存原始 SCSS 代码到文件
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_received_style.scss`), scssCode, 'utf8');
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_compiled_style.css`), compiledCss, 'utf8');


        // 2. 编译 JSX 为纯 JavaScript
        let compiledJsx;
        let componentName = 'App'; // 默认使用 App，如果找不到其他组件
        try {
            // --- 关键修改：替换 JSX 中的图片路径 from ../img/ 到 ./assets/ ---
            // 适用于 <img src="../img/..." /> 这样的 JSX 结构
            let processedJsxCode = jsxCode.replace(/\.\.\/img\//g, './assets/');

            compiledJsx = Babel.transform(processedJsxCode, { // <-- 确保这里使用了 processedJsxCode
                plugins: [
                    ['transform-react-jsx', { pragma: 'React.createElement' }], 
                ],
            }).code;

            // --- 关键修复：确保移除所有可能的 import 和 export 语句 ---
            compiledJsx = compiledJsx.replace(/^import(?:["'].*?['"]|.*?;)?\n?/gm, ''); 
            compiledJsx = compiledJsx.replace(/export (default )?.*;?\n?/g, ''); 

            // --- 关键修复：查找第一个大写字母开头的函数或类组件，并将其挂载到 window.App ---
            // 匹配 function SomeComponent() {} 或 class SomeComponent extends ... {}
            const componentNameMatch = compiledJsx.match(/(?:function|class)\s+([A-Z][a-zA-Z0-9]*)\s*(?:\(|extends)/);
            
            if (componentNameMatch && componentNameMatch[1]) {
                componentName = componentNameMatch[1];
                console.log(`Found main component named: ${componentName}`);
            } else {
                // 新增：尝试查找 const SomeComponent = ... 形式的组件
                const topLevelVarMatch = compiledJsx.match(/const\s+([A-Z][a-zA-Z0-9]*)\s*=/);
                if (topLevelVarMatch && topLevelVarMatch[1]) {
                    componentName = topLevelVarMatch[1];
                    console.log(`Found top-level component variable: ${componentName}`);
                } else {
                    console.log('Could not reliably extract component name. Defaulting to "App".');
                }
            }
            
            // 将找到的组件赋值给 window.App，确保渲染器能找到
            // 确保组件名被正确引用，而不是直接使用一个未定义的变量
            compiledJsx += `\nwindow.App = ${componentName};`; // <-- 这里使用实际的组件名
            
            // 确保在 compiledJsx 的开头加入 'use strict'; 避免某些严格模式问题
            compiledJsx = `'use strict';\n${compiledJsx}`;


            console.log('--- Compiled JSX (first 1000 chars) ---');
            console.log(compiledJsx.substring(0, 1000)); // 打印更多字符
            console.log('--- End Compiled JSX ---');
        } catch (babelError) {
            console.error('❌ Babel compilation error for JSX:', babelError.message);
            await page.setContent(`<html><body><div style="color: red; padding: 20px;">Error compiling JSX: ${babelError.message}</div></body></html>`);
            await page.screenshot({ path: outputPath });
            return;
        }
        // 保存原始 JSX 代码到文件
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_received_code.jsx`), jsxCode, 'utf8');
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_compiled_code.js`), compiledJsx, 'utf8');


        // 3. 构建 HTML 页面
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
                <style>
                    body { margin: 0; }
                    ${compiledCss}
                </style>
            </head>
            <body>
                <div id="root" style="min-height: 100vh;"></div>
                <script type="text/javascript">
                    // React 和 ReactDOM 库已通过 <script> 标签全局可用
                    // 编译后的 JSX 代码，包含强制挂载到 window.App 的逻辑
                    ${compiledJsx}

                    console.log('Attempting to render component...');
                    try {
                        // 此时 window.App 应该已经被赋值为我们想要渲染的组件
                        if (typeof window.App === 'function') {
                            console.log('Found component: window.App. Attempting to render...');
                            ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(window.App));
                            console.log('React component rendered successfully.');
                        } else {
                            const errorMsg = "Could not find 'window.App' React component after compilation. Check compiled_code.js.";
                            console.error('❌', errorMsg);
                            document.getElementById('root').innerHTML = \`<div style="color: red; padding: 20px;">COMPONENT NOT FOUND ERROR: \${errorMsg}</div>\`;
                        }
                    } catch (renderError) {
                        console.error("❌ React render error in browser context:", renderError.message);
                        document.getElementById('root').innerHTML = \`<div style="color: red; padding: 20px;">REACT RENDER ERROR: \${renderError.message}</div>\`;
                    }
                </script>
            </body>
            </html>
        `;
        
        // 保存初始构建的 HTML 文件，用于调试
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_initial_render.html`), htmlContent, 'utf8');

        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        // 增加延迟到 2 秒，确保页面充分渲染，包括异步加载的内容
        await new Promise(resolve => setTimeout(resolve, 2000)); 

        // 获取页面的内部HTML (最终渲染的 DOM 结构)
        const pageContent = await page.content();
        console.log('--- Page Rendered HTML (full content saved to file) ---');
        // 打印前 2000 个字符到控制台，了解大致结构
        console.log(pageContent.substring(0, 2000)); 
        console.log('--- End Page Rendered HTML ---');

        // 保存最终渲染的 DOM 结构到文件
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_final_rendered_dom.html`), pageContent, 'utf8');

        // 检查 #root 元素是否包含内容 (调试用)
        const rootContent = await page.evaluate(() => document.getElementById('root') ? document.getElementById('root').innerHTML : 'N/A');
        console.log('--- Content of #root element (full content saved to file) ---');
        // 打印前 2000 个字符到控制台
        console.log(rootContent.substring(0, 2000));
        console.log('--- End Content of #root ---');

        // 保存 #root 元素内部的 HTML 到文件
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_root_inner_html.html`), rootContent, 'utf8');


        await page.screenshot({ path: outputPath, fullPage: true });
        console.log(`Screenshot saved to ${outputPath}`);

    } catch (error) {
        console.error('❌ Puppeteer or general rendering error (outside browser context):', error);
        if (browser) await browser.close();
        // 尝试保存一个带有错误的截图
        try {
            const tempBrowser = await puppeteer.launch({headless: true}); // 尝试不指定路径，看是否能启动任何浏览器
            const tempPage = await tempBrowser.newPage();
            await tempPage.setContent(`<div style="color: red; padding: 20px;">GLOBAL ERROR: ${error.message}<br>Stack: ${error.stack}</div>`); // 打印堆栈信息
            await tempPage.screenshot({path: outputPath});
            await tempBrowser.close();
        } catch (screenshotError) {
            console.error('❌ Failed to save error screenshot:', screenshotError);
        }
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_error_log.txt`), `Error: ${error.message}\nStack: ${error.stack}`, 'utf8');
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

renderAndScreenshot();
