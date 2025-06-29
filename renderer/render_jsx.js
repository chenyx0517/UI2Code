const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const Babel = require('@babel/standalone');
const sass = require('sass'); // 引入 sass 库

// 命令行参数顺序：<output_path_for_screenshot> <jsx_code_base64> <scss_code_base64>
const outputPath = process.argv[2]; // 截图的最终保存路径
const jsxCodeBase64 = process.argv[3];
const scssCodeBase64 = process.argv[4]; // 这里的变量名是 scssCodeBase64

// 解析输出文件路径，用于保存调试 HTML
const outputDir = path.dirname(outputPath);
const itemBaseName = path.basename(outputPath, '.png'); // 通常是 rendered_screenshot

const jsxCode = Buffer.from(jsxCodeBase64, 'base64').toString('utf8');
// FIXED AGAIN: 确保 scssCodeBase64 的拼写是正确的
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
            console.error(`❌ Error: Chrome executable not found. Please check path: ${CHROME_EXECUTABLE_PATH}`);
            // Save error screenshot to display clear error message
            await (async () => {
                let tempBrowser;
                try {
                    tempBrowser = await puppeteer.launch({headless: true});
                    const tempPage = await tempBrowser.newPage();
                    await tempPage.setContent(`<div style="color: red; padding: 20px;">ERROR: Chrome executable not found at:<br>${CHROME_EXECUTABLE_PATH}</div>`);
                    await tempPage.screenshot({path: outputPath});
                } catch (tempLaunchError) {
                    console.error('❌ Could not launch temporary browser for error screenshot:', tempLaunchError.message);
                } finally {
                    if (tempBrowser) await tempBrowser.close();
                }
            })();
            // Write error log file
            fs.writeFileSync(path.join(outputDir, `${itemBaseName}_error_log.txt`), `Error: Chrome executable not found at ${CHROME_EXECUTABLE_PATH}`, 'utf8');
            return;
        }

        browser = await puppeteer.launch({
            headless: true, // Run in headless mode (browser runs in background)
            executablePath: CHROME_EXECUTABLE_PATH, // <-- Force use of manually specified path
            ignoreDefaultArgs: ['--disable-extensions'], // Ignore some default arguments to avoid conflicts
            args: [
                '--no-sandbox',             // Disable sandboxing, necessary for some environments
                '--disable-setuid-sandbox', // Disable setuid sandbox
                '--disable-gpu',            // Disable GPU hardware acceleration to avoid compatibility issues
                '--disable-dev-shm-usage',  // Disable /dev/shm usage to avoid out of memory issues
                '--no-zygote',              // Avoid issues on some Linux systems
                '--single-process',         // Use single process mode to reduce resource consumption, potentially more stable
                '--disable-web-security',   // Disable web security, may be needed for local files or cross-origin content
                '--allow-insecure-localhost' // Allow insecure localhost connections
            ]
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 800 });

        // Set up page error listener to catch uncaught errors within the browser
        page.on('pageerror', error => {
            console.error('❌ Browser page error (runtime JS error):', error.message);
        });
        // Capture browser console logs
        page.on('console', message => {
            console.log(`Browser console ${message.type()}: ${message.text()}`);
            if (message.type() === 'error') {
                console.error(`❌ Browser console error: ${message.text()}`);
            }
        });


        // 1. Compile SCSS to CSS
        let compiledCss = '';
        if (scssCode) {
            try {
                // --- Key fix: Replace non-standard 'dx' units with 'px' in SCSS ---
                let processedScss = scssCode.replace(/(\d+)\s*dx/g, '$1px'); // Correct regex for '10dx' and '10 dx'
                
                // --- Key fix: Replace image paths in SCSS from ../img/ to ./assets/ ---
                // Because the HTML file is in the item_id directory, and images are in item_id/assets
                processedScss = processedScss.replace(/\.\.\/img\//g, './assets/'); 

                const result = sass.compileString(processedScss); // <-- Ensure processedScss is used here
                compiledCss = result.css.toString();
                console.log('SCSS compiled successfully (first 500 chars):', compiledCss.substring(0, 500));
            } catch (sassError) {
                console.error('❌ SCSS compilation error:', sassError.message);
                compiledCss = `/* SCSS Compilation Error: ${sassError.message} */ body { background-color: #ffe0e0; padding: 20px; font-family: sans-serif; } #root::before { content: "SCSS ERROR: ${sassError.message.replace(/"/g, "'").replace(/\n/g, '\\A')}"; color: red; display: block; white-space: pre-wrap; word-wrap: break-word; }`;
            }
        }
        // Save raw SCSS code to file
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_received_style.scss`), scssCode, 'utf8');
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_compiled_style.css`), compiledCss, 'utf8');


        // 2. Compile JSX to plain JavaScript
        let compiledJsx;
        let componentName = 'App'; // Default to App if no other component found
        try {
            // --- Key fix: Replace image paths in JSX from ../img/ to ./assets/ ---
            // Applies to <img src="../img/..." /> and similar JSX structures
            let processedJsxCode = jsxCode.replace(/\.\.\/img\//g, './assets/');

            compiledJsx = Babel.transform(processedJsxCode, { // <-- Ensure processedJsxCode is used here
                plugins: [
                    ['transform-react-jsx', { pragma: 'React.createElement' }], 
                ],
            }).code;

            // --- Key fix: Ensure all possible import and export statements are removed ---
            compiledJsx = compiledJsx.replace(/^import(?:["'].*?['"]|.*?;)?\n?/gm, ''); 
            compiledJsx = compiledJsx.replace(/export (default )?.*;?\n?/g, ''); 

            // --- Key fix: Find the first PascalCase function or class component and mount it to window.App ---
            // Matches function SomeComponent() {} or class SomeComponent extends ... {}
            const componentNameMatch = compiledJsx.match(/(?:function|class)\s+([A-Z][a-zA-Z0-9]*)\s*(?:\(|extends)/);
            
            if (componentNameMatch && componentNameMatch[1]) {
                componentName = componentNameMatch[1];
                console.log(`Found main component named: ${componentName}`);
            } else {
                // New: Try to find const SomeComponent = ... style components
                const topLevelVarMatch = compiledJsx.match(/const\s+([A-Z][a-zA-Z0-9]*)\s*=/);
                if (topLevelVarMatch && topLevelVarMatch[1]) {
                    componentName = topLevelVarMatch[1];
                    console.log(`Found top-level component variable: ${componentName}`);
                } else {
                    console.log('Could not reliably extract component name. Defaulting to "App".');
                }
            }
            
            // Assign the found component to window.App to ensure the renderer can find it
            // Make sure the component name is correctly referenced, not an undefined variable
            compiledJsx += `\nwindow.App = ${componentName};`; // <-- Use the actual component name here
            
            // Ensure 'use strict'; is added at the beginning of compiledJsx to avoid certain strict mode issues
            compiledJsx = `'use strict';\n${compiledJsx}`;


            console.log('--- Compiled JSX (first 1000 chars) ---');
            console.log(compiledJsx.substring(0, 1000)); // Print more characters
            console.log('--- End Compiled JSX ---');
        } catch (babelError) {
            console.error('❌ Babel compilation error for JSX:', babelError.message);
            await page.setContent(`<html><body><div style="color: red; padding: 20px;">Error compiling JSX: ${babelError.message}</div></body></html>`);
            await page.screenshot({ path: outputPath });
            return;
        }
        // Save raw JSX code to file
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_received_code.jsx`), jsxCode, 'utf8');
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_compiled_code.js`), compiledJsx, 'utf8');


        // 3. Build the HTML page
        const htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Generated Page</title>
                <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
                <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
                
                <!-- Injected compiled CSS -->
                <style>
                    body { margin: 0; }
                    ${compiledCss}
                </style>
            </head>
            <body>
                <div id="root" style="min-height: 100vh;"></div>
                <script type="text/javascript">
                    // React and ReactDOM libraries are globally available via <script> tags
                    // Compiled JSX code, including logic to force-mount to window.App
                    ${compiledJsx}

                    console.log('Attempting to render component...');
                    try {
                        // At this point, window.App should have been assigned the component we want to render
                        if (typeof window.App === 'function') {
                            console.log('Found component: window.App. Attempting to render...');
                            ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(window.App));
                            console.log('React component rendered successfully.');
                        } else {
                            const errorMsg = "Could not find 'window.App' React component after compilation. Check compiled_code.js.";
                            console.error('❌', errorMsg);
                            // --- FIXED: Use regular string concatenation for the innerHTML assignment ---
                            document.getElementById('root').innerHTML = '<div style="color: red; padding: 20px;">COMPONENT NOT FOUND ERROR: ' + errorMsg + '</div>';
                        }
                    } catch (renderError) {
                        console.error("❌ React render error in browser context:", renderError.message);
                        // --- FIXED: Use regular string concatenation for the innerHTML assignment ---
                        document.getElementById('root').innerHTML = '<div style="color: red; padding: 20px;">REACT RENDER ERROR: ' + renderError.message + '</div>';
                    }
                </script>
            </body>
            </html>
        `;
        
        // Save the initially constructed HTML file for debugging
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_initial_render.html`), htmlContent, 'utf8');

        await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
        
        // Add a delay of 2 seconds to ensure the page is fully rendered, including asynchronously loaded content
        await new Promise(resolve => setTimeout(resolve, 2000)); 

        // Get the page's inner HTML (final rendered DOM structure)
        const pageContent = await page.content();
        console.log('--- Page Rendered HTML (full content saved to file) ---');
        // Print the first 2000 characters to the console for a rough idea of the structure
        console.log(pageContent.substring(0, 2000)); 
        console.log('--- End Page Rendered HTML ---');

        // Save the final rendered DOM structure to a file
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_final_rendered_dom.html`), pageContent, 'utf8');

        // Check if #root element contains content (for debugging)
        const rootContent = await page.evaluate(() => document.getElementById('root') ? document.getElementById('root').innerHTML : 'N/A');
        console.log('--- Content of #root element (full content saved to file) ---');
        // Print the first 2000 characters to the console
        console.log(rootContent.substring(0, 2000));
        console.log('--- End Content of #root ---');

        // Save the inner HTML of the #root element to a file
        fs.writeFileSync(path.join(outputDir, `${itemBaseName}_root_inner_html.html`), rootContent, 'utf8');


        await page.screenshot({ path: outputPath, fullPage: true });
        console.log(`Screenshot saved to ${outputPath}`);

    } catch (error) {
        console.error('❌ Puppeteer or general rendering error (outside browser context):', error);
        if (browser) await browser.close();
        // Try to save a screenshot with the error
        try {
            const tempBrowser = await puppeteer.launch({headless: true}); // Try launching without specifying path to see if any browser starts
            const tempPage = await tempBrowser.newPage();
            await tempPage.setContent(`<div style="color: red; padding: 20px;">GLOBAL ERROR: ${error.message}<br>Stack: ${error.stack}</div>`); // Print stack trace
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
