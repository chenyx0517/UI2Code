const puppeteer = require("puppeteer")
const fs = require("fs")
const path = require("path")
const Babel = require("@babel/standalone")
const sass = require("sass") // 新增：引入 sass 库

// 命令行参数顺序：<output_path_for_screenshot> <jsx_code_base64> <scss_code_base64>
const outputPath = process.argv[2]
const jsxCodeBase64 = process.argv[3]
const scssCodeBase64 = process.argv[4] // 新增：接收 Base64 编码的 SCSS 代码

const jsxCode = Buffer.from(
	jsxCodeBase64,
	"base64"
).toString("utf8")
// 检查 scssCodeBase64 是否存在，如果不存在则为空字符串
const scssCode = scssCodeBase64
	? Buffer.from(
			scssCodeBase64,
			"base64"
	  ).toString("utf8")
	: ""

async function renderAndScreenshot() {
	let browser
	try {
		browser = await puppeteer.launch({
			headless: true,
			args: [
				"--no-sandbox",
				"--disable-setuid-sandbox"
			]
		})
		const page = await browser.newPage()
		await page.setViewport({
			width: 1280,
			height: 800
		})

		// 1. 编译 SCSS 为 CSS
		let compiledCss = ""
		if (scssCode) {
			try {
				// 使用 sass.compileString 编译 SCSS 字符串
				const result =
					sass.compileString(scssCode)
				compiledCss =
					result.css.toString()
				console.log(
					"SCSS compiled successfully (first 200 chars):",
					compiledCss.substring(0, 200)
				) // 调试用
			} catch (sassError) {
				console.error(
					"❌ SCSS compilation error:",
					sassError.message
				)
				compiledCss = `/* SCSS Compilation Error: ${sassError.message} */ body { background-color: #fdd; }` // 错误时显示红色背景
			}
		}

		// 2. 编译 JSX 为纯 JavaScript
		let compiledJsx // 声明变量
		try {
			compiledJsx = Babel.transform(
				jsxCode,
				{
					presets: ["react"]
				}
			).code

			// 打印编译后的 JSX (JavaScript 代码) - 调试用
			console.log(
				"--- Compiled JSX (first 500 chars) ---"
			)
			console.log(
				compiledJsx.substring(0, 500)
			)
			console.log(
				"--- End Compiled JSX ---"
			)
		} catch (babelError) {
			console.error(
				"❌ Babel compilation error for JSX:",
				babelError.message
			)
			// 如果 JSX 编译失败，设置一个错误页面并截图
			await page.setContent(
				`<html><body><div style="color: red;">Error compiling JSX: ${babelError.message}</div></body></html>`
			)
			await page.screenshot({
				path: outputPath
			})
			return // 编译失败，直接返回
		}

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
                <div id="root"></div>
                <script type="text/javascript">
                    ${compiledJsx}

                    let ComponentToRender;
                    let foundKey = 'App'; // 修复：将 foundKey 声明提升到更广的作用域
                    console.log('Attempting to find React component...'); // 调试日志
                    try {
                        if (typeof window.App === 'function') {
                            ComponentToRender = window.App;
                            foundKey = 'App'; // 如果是 App，也记录下来
                            console.log('Found component: window.App'); // 调试日志
                        } else {
                            const keys = Object.keys(window);
                            for (const key of keys) {
                                // 查找任何看起来像 React 组件的函数，例如包含 'Page' 的名称
                                if (typeof window[key] === 'function' && key.match(/^(?:[A-Z][a-zA-Z0-9]*Page|[A-Z][a-zA-Z0-9]*)$/) && !['React', 'ReactDOM', 'Babel', 'puppeteer', 'fs', 'path', 'sass'].includes(key)) {
                                    ComponentToRender = window[key];
                                    foundKey = key;
                                    break;
                                }
                            }
                            if (foundKey) { // 这个检查现在是安全的，因为 foundKey 总会被声明
                                console.log(\`Found component\`); // 调试日志
                            }
                        }

                        if (!ComponentToRender) {
                            const errorMsg = "Could not find a React component to render. Ensure your JSX defines a functional component (e.g., 'function App() { ... }' or 'function MyPage() { ... }') and is globally accessible.";
                            console.error('❌', errorMsg); // 调试日志
                            throw new Error(errorMsg);
                        }

                        console.log('Attempting to render component...'); // 调试日志
                        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ComponentToRender));
                        console.log('React component rendered successfully.'); // 调试日志

                    } catch (renderError) {
                        console.error("❌ React render error in browser context:", renderError.message); // 调试日志
                        // 显示 React 渲染错误信息在页面上
                        document.getElementById('root').innerHTML = \`<div style="color: red; padding: 20px;">Error rendering React component: renderError.message</div>\`;
                    }
                </script>
            </body>
            </html>
        `

		fs.writeFileSync(
			outputPath + "page.html",
			htmlContent
		) // 保存错误信息到文件

		await page.setContent(htmlContent, {
			waitUntil: "networkidle0"
		})

		// 增加延迟，确保页面充分渲染（尤其是图片加载和CSS应用）
		await new Promise((resolve) =>
			setTimeout(resolve, 1000)
		)

		// 获取页面的内部HTML (调试用)
		const pageContent =
			await page.content()
		console.log(
			"--- Page Rendered HTML (first 500 chars) ---"
		)
		console.log(
			pageContent.substring(0, 500)
		)
		console.log(
			"--- End Page Rendered HTML ---"
		)

		// 检查 #root 元素是否包含内容 (调试用)
		const rootContent =
			await page.evaluate(() =>
				document.getElementById("root")
					? document.getElementById(
							"root"
					  ).innerHTML
					: "N/A"
			)
		console.log(
			"--- Content of #root element (first 500 chars) ---"
		)
		console.log(
			rootContent.substring(0, 500)
		)
		console.log(
			"--- End Content of #root ---"
		)

		await page.screenshot({
			path: outputPath,
			fullPage: true
		})
		console.log(
			`Screenshot saved to ${outputPath}`
		)
	} catch (error) {
		console.error(
			"❌ Puppeteer or general rendering error (outside browser context):",
			error
		)
		if (browser) await browser.close()
		fs.writeFileSync(
			outputPath + ".error",
			`Error: ${error.message}`
		) // 保存错误信息到文件
	} finally {
		if (browser) {
			await browser.close()
		}
	}
}

renderAndScreenshot()
