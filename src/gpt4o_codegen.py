import os
from dotenv import load_dotenv
from openai import OpenAI
import base64
import json 
from datetime import datetime 
import subprocess # 新增：用于调用 Node.js 渲染脚本
from PIL import Image # 新增：用于图像处理
from skimage.metrics import structural_similarity as ssim # 新增：用于 SSIM 计算
import numpy as np # 新增：用于图像处理
import difflib # 新增：用于代码相似度计算
load_dotenv()

# --- Prompt 文件路径和加载函数 (这部分保持不变) ---
current_script_dir = os.path.dirname(os.path.abspath(__file__))
SYSTEM_PROMPT_FILE = os.path.join(current_script_dir, 'prompts', 'ui2code_system_prompt.txt')
USER_PROMPT_TEMPLATE_FILE = os.path.join(current_script_dir, 'prompts', 'ui2code_user_template.txt')

def load_prompt_from_file(filepath: str) -> str:
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read().strip()
    except FileNotFoundError:
        print(f"❌ 错误：Prompt 文件未找到：{filepath}。请检查路径和文件名。")
        return ""
    except Exception as e:
        print(f"❌ 错误：加载 prompt 文件 {filepath} 时出错：{e}")
        return ""

SYSTEM_PROMPT = load_prompt_from_file(SYSTEM_PROMPT_FILE)
USER_PROMPT_TEMPLATE = load_prompt_from_file(USER_PROMPT_TEMPLATE_FILE)

if not SYSTEM_PROMPT or not USER_PROMPT_TEMPLATE:
    print("❌ 错误：系统或用户 Prompt 内容为空。请检查文件是否正确加载。")
    exit()


proxy_base_url = os.getenv("OPENAI_API_BASE")

client = OpenAI(
    api_key=os.getenv("OPENAI_API_KEY"),
    base_url=proxy_base_url 
)

# --- 辅助函数：图片编码  ---
def encode_image(image_path: str) -> str:
    with open(image_path, "rb") as image_file:
        return base64.b64encode(image_file.read()).decode("utf-8")
    
# --- 新增函数：渲染 JSX 代码为图片 ---
def render_jsx_to_screenshot(jsx_code: str, output_path: str) -> bool:
    """
    使用 Node.js 脚本渲染 JSX 代码为图片。
    Args:
        jsx_code (str): 需要渲染的 JSX 代码字符串。
        output_path (str): 截图保存的路径。
    Returns:
        bool: 渲染是否成功。
    """
    # 假设 renderer 目录在项目根目录下，与 src 目录同级
    # current_script_dir 是 src 目录的路径
    renderer_script_path = os.path.join(os.path.dirname(current_script_dir), 'renderer', 'render_jsx.js')
    
    if not os.path.exists(renderer_script_path):
        print(f"❌ 错误：JSX 渲染脚本未找到：{renderer_script_path}。请确保已设置 renderer 目录。")
        return False

    jsx_code_base64 = base64.b64encode(jsx_code.encode('utf-8')).decode('utf-8')

    try:
        # 调用 Node.js 脚本，传递输出路径和 Base64 编码的 JSX 代码
        result = subprocess.run(
            ['node', renderer_script_path, output_path, jsx_code_base64],
            capture_output=True, # 捕获 stdout 和 stderr
            text=True, # 以文本模式捕获输出
            check=True # 如果命令返回非零退出码，则抛出 CalledProcessError
        )
        print("Node.js stdout:", result.stdout) # 调试时可以打开
        print("Node.js stderr:", result.stderr) # 调试时可以打开
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ 渲染 JSX 出错 (Node.js 退出码: {e.returncode}): {e.stderr}")
        return False
    except FileNotFoundError:
        print(f"❌ 错误：Node.js 命令未找到。请确保 Node.js 已安装并配置在 PATH 中。")
        return False
    except Exception as e:
        print(f"❌ 渲染 JSX 时发生意外错误: {e}")
        return False
    
# --- 新增函数：计算图像相似度 (SSIM) ---
def calculate_image_ssim(img1_path: str, img2_path: str) -> float:
    """
    计算两张图片之间的结构相似性指数 (SSIM)。
    图片会被转换为灰度图并调整大小以匹配。
    """
    try:
        img1 = Image.open(img1_path).convert('L') # 转换为灰度图
        img2 = Image.open(img2_path).convert('L')

        # 确保图片大小一致，以较小者为准，防止 SSIM 报错
        min_width = min(img1.width, img2.width)
        min_height = min(img1.height, img2.height)
        img1 = img1.resize((min_width, min_height))
        img2 = img2.resize((min_width, min_height))

        img1_np = np.array(img1)
        img2_np = np.array(img2)

        # SSIM 分数通常在 -1 到 1 之间，1 表示完全相同
        score = ssim(img1_np, img2_np, data_range=img1_np.max() - img1_np.min(), channel_axis=None)
        return score
    except FileNotFoundError:
        print(f"❌ 错误：图片文件未找到，无法计算 SSIM。请检查路径：{img1_path} 或 {img2_path}")
        return 0.0
    except Exception as e:
        print(f"❌ 计算 SSIM 时出错：{e}")
        return 0.0

# --- 新增函数：计算代码相似度 (简单的行相似度) ---
def calculate_code_similarity(code1: str, code2: str) -> float:
    """
    计算两段代码的简单行相似度（基于 difflib 的 SequenceMatcher）。
    它会忽略空白行和每行前后的空格。
    """
    # 将代码按行分割，移除空行和每行前后的空格
    lines1 = [line.strip() for line in code1.splitlines() if line.strip()]
    lines2 = [line.strip() for line in code2.splitlines() if line.strip()]

    # 处理空代码情况
    if not lines1 and not lines2:
        return 1.0 # 两段都是空代码，视为完全相似
    if not lines1 or not lines2:
        return 0.0 # 一段为空，另一段不为空，视为不相似

    # 使用 difflib 的 SequenceMatcher 计算相似度
    s = difflib.SequenceMatcher(None, lines1, lines2)
    return s.ratio() # 返回相似度分数 (0.0 到 1.0)

# --- 新增辅助函数：获取页面资产列表 ---
def get_image_assets_list(screenshot_path: str) -> str:
    """
    根据截图路径，获取其同级目录下的 'assets/' 文件夹中的图片文件名列表。
    例如：如果截图是 'data/processed/ui2code_dataset/item_00001/screenshot.png'
    则会查找 'data/processed/ui2code_dataset/item_00001/assets/' 中的图片。
    """
    # 获取页面实例的根目录 (例如 item_00001)
    page_instance_dir = os.path.dirname(screenshot_path)
    assets_dir = os.path.join(page_instance_dir, 'assets')

    if not os.path.isdir(assets_dir):
        return "无。" # 如果没有 assets 目录，返回“无”

    image_files = []
    for filename in os.listdir(assets_dir):
        # 仅添加常见的图片格式
        if filename.lower().endswith(('.png', '.jpg', '.jpeg', '.gif', '.svg')):
            image_files.append(filename)

    if not image_files:
        return "无。"
    
    # 格式化为列表字符串，例如："- logo.png\n- icon_user.png"
    return "\n".join([f"- {f}" for f in sorted(image_files)])

# --- 保存结果的函数 ---
def save_generated_result(
    output_dir: str,
    item_id: str,
    generated_code: str,
    screenshot_path: str, # 原始截图路径
    generated_screenshot_path: str, # 生成代码渲染的截图路径
    image_assets_info: str,
    model_name: str,
    system_prompt_content: str,
    user_prompt_content: str,
    metrics: dict # 新增：要保存的指标
):
    """
    保存模型生成的代码和相关元数据。
    """
    item_output_dir = os.path.join(output_dir, item_id)
    os.makedirs(item_output_dir, exist_ok=True) # 确保目录存在

    # 保存生成的代码
    code_filepath = os.path.join(item_output_dir, 'generated_code.jsx')
    with open(code_filepath, 'w', encoding='utf-8') as f:
        f.write(generated_code)
    # print(f"✅ 生成代码已保存到: {code_filepath}") # 批量处理时减少输出

    # 保存输入截图的路径
    screenshot_path_filepath = os.path.join(item_output_dir, 'input_screenshot_path.txt')
    with open(screenshot_path_filepath, 'w', encoding='utf-8') as f:
        f.write(screenshot_path)

    # 保存输入给模型的图片资产列表
    image_assets_filepath = os.path.join(item_output_dir, 'input_image_assets.txt')
    with open(image_assets_filepath, 'w', encoding='utf-8') as f:
        f.write(image_assets_info)

    # 保存元数据和指标
    metadata = {
        "timestamp": datetime.now().isoformat(),
        "item_id": item_id,
        "model_used": model_name,
        "input_screenshot_path": screenshot_path,
        "generated_screenshot_path": generated_screenshot_path, # 记录生成图片的路径
        "input_image_assets_info": image_assets_info,
        "system_prompt_used": system_prompt_content,
        "user_prompt_content_sent": user_prompt_content, # 实际发送给模型的用户prompt
        "generated_code_filepath": os.path.relpath(code_filepath, output_dir), # 相对路径
        "metrics": metrics # 将指标添加到元数据中
    }
    metadata_filepath = os.path.join(item_output_dir, 'metadata.json')
    with open(metadata_filepath, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=4, ensure_ascii=False)
    # print(f"✅ 元数据和指标已保存到: {metadata_filepath}") # 批量处理时减少输出



# --- 生成代码的核心函数 (修改以包含保存和计算指标逻辑) ---
def generate_code_from_screenshot(screenshot_path: str, output_base_dir: str, model: str = "gpt-4o") -> dict:
    """
    根据页面截图生成 React + Tailwind CSS 代码，并计算相关指标。
    返回包含生成结果和指标的字典。
    """
    if not os.path.exists(screenshot_path):
        return {"status": "error", "message": f"❌ 错误：截图文件不存在：{screenshot_path}", "item_id": os.path.basename(os.path.dirname(screenshot_path)), "metrics": {}}

    base64_image = encode_image(screenshot_path)
    image_assets_info = get_image_assets_list(screenshot_path)
    f = open(USER_PROMPT_TEMPLATE_FILE)
    final_user_prompt_content = f.read()
    final_user_prompt_content = final_user_prompt_content.format(image_assets_list=image_assets_info)
    item_id = os.path.basename(os.path.dirname(screenshot_path))
    if not item_id.startswith("item_"):
        print(f"⚠️ 警告：无法从路径 {screenshot_path} 提取有效的 item_id。将使用 'unknown_item'。")
        item_id = "unknown_item"

    generated_code = ""
    status_message = "成功"
    metrics = {
        "code_similarity_score": 0.0,
        "visual_similarity_ssim_score": 0.0,
        "generation_success": False,
        "rendering_success": False,
        "error_details": "" # 新增错误详情字段
    }
    generated_screenshot_path = "" # 初始化，可能不会生成

    try:
        # 调用大模型生成代码
        print(final_user_prompt_content)
        response = client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": final_user_prompt_content},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{base64_image}",
                                "detail": "high"
                            }
                        }
                    ]
                }
            ],
            temperature=0.4,
            max_tokens=4000
        )
        generated_code = response.choices[0].message.content.strip()
        metrics["generation_success"] = True

        # --- 获取真实代码 (Ground Truth) ---
        original_jsx_path = os.path.join(os.path.dirname(screenshot_path), 'index.jsx')
        original_jsx_code = ""
        if os.path.exists(original_jsx_path):
            with open(original_jsx_path, 'r', encoding='utf-8') as f:
                original_jsx_code = f.read().strip()
            metrics["code_similarity_score"] = calculate_code_similarity(generated_code, original_jsx_code)
        else:
            print(f"⚠️ 警告：未找到原始 JSX 代码：{original_jsx_path}。无法计算代码相似度。")
            metrics["error_details"] += "Original JSX not found. "

        # --- 渲染生成的代码并计算视觉相似度 ---
        generated_screenshot_path = os.path.join(output_base_dir, item_id, 'rendered_screenshot.png')
        os.makedirs(os.path.dirname(generated_screenshot_path), exist_ok=True) # 确保渲染截图的目录存在

        if render_jsx_to_screenshot(generated_code, generated_screenshot_path):
            metrics["rendering_success"] = True
            metrics["visual_similarity_ssim_score"] = calculate_image_ssim(screenshot_path, generated_screenshot_path)
        else:
            print(f"❌ 渲染 '{item_id}' 的生成代码失败。")
            metrics["error_details"] += "Rendering failed. "
            status_message = "渲染失败"

        # --- 保存所有结果 ---
        save_generated_result(
            output_dir=output_base_dir,
            item_id=item_id,
            generated_code=generated_code,
            screenshot_path=screenshot_path,
            generated_screenshot_path=generated_screenshot_path, # 保存渲染后的图片路径
            image_assets_info=image_assets_info,
            model_name=model,
            system_prompt_content=SYSTEM_PROMPT,
            user_prompt_content=final_user_prompt_content,
            metrics=metrics # 传入计算好的指标
        )
        
        return {"status": "success", "message": "生成和评估成功", "metrics": metrics, "item_id": item_id}

    except Exception as e:
        metrics["generation_success"] = False
        metrics["error_details"] += f"Generation failed: {e}. "
        status_message = f"生成失败: {e}"
        print(f"❌ 处理 {item_id} 时出错了：{e}")
        
        # 即使失败也尝试保存（可能会保存部分代码或仅错误信息）
        save_generated_result(
            output_dir=output_base_dir,
            item_id=item_id,
            generated_code=generated_code, # 即使失败，也保存已获取到的部分代码
            screenshot_path=screenshot_path,
            generated_screenshot_path=generated_screenshot_path, # 如果渲染失败，这里会是空字符串
            image_assets_info=image_assets_info,
            model_name=model,
            system_prompt_content=SYSTEM_PROMPT,
            user_prompt_content=final_user_prompt_content,
            metrics=metrics # 传入计算好的指标
        )
        return {"status": "error", "message": status_message, "metrics": metrics, "item_id": item_id}


if __name__ == "__main__":
    # 定义数据集的根目录
    DATASET_ROOT_DIR = os.path.join('data', 'processed', 'ui2code_dataset')
    
    # 定义结果保存的根目录，每次运行生成一个带时间戳的子目录
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    RESULTS_BASE_DIR = os.path.join('data', 'generated_results', f'run_{timestamp}')
    os.makedirs(RESULTS_BASE_DIR, exist_ok=True) # 确保结果目录存在

    all_item_results = [] # 存储所有项目的评估结果

    print(f"🚀 开始批量处理数据集 '{DATASET_ROOT_DIR}'...")
    print(f"所有结果将保存到: {RESULTS_BASE_DIR}")

    # 遍历数据集目录下的所有 item_XXXXX 文件夹
    # 确保只处理目录，且以 'item_' 开头
    item_dirs = [d for d in os.listdir(DATASET_ROOT_DIR) 
                 if os.path.isdir(os.path.join(DATASET_ROOT_DIR, d)) and d.startswith('item_')]
    item_dirs.sort() # 按名称排序，确保处理顺序一致

    total_items = len(item_dirs)
    processed_count = 0

    for item_dir_name in item_dirs:
        processed_count += 1
        item_screenshot_path = os.path.join(DATASET_ROOT_DIR, item_dir_name, 'screenshot.png')
        
        print(f"\n--- 处理 {item_dir_name} ({processed_count}/{total_items}) ---")
        if not os.path.exists(item_screenshot_path):
            print(f"⚠️ 警告：跳过 {item_dir_name}，因为未找到 'screenshot.png'。")
            continue
        
        # 调用核心生成和评估函数
        result = generate_code_from_screenshot(item_screenshot_path, output_base_dir=RESULTS_BASE_DIR)
        all_item_results.append(result)
        
        # 打印当前项目的简要结果
        print(f"项目 {item_dir_name} 状态: {result.get('status')}")
        if 'metrics' in result:
            metrics = result['metrics']
            print(f"  - 生成代码成功: {'是' if metrics.get('generation_success') else '否'}")
            print(f"  - 渲染页面成功: {'是' if metrics.get('rendering_success') else '否'}")
            print(f"  - 代码相似度: {metrics.get('code_similarity_score', 0.0):.4f}")
            print(f"  - 视觉相似度 (SSIM): {metrics.get('visual_similarity_ssim_score', 0.0):.4f}")
            if metrics.get('error_details'):
                print(f"  - 错误详情: {metrics.get('error_details')}")


    # --- 汇总并保存所有指标 ---
    summary_filepath = os.path.join(RESULTS_BASE_DIR, 'summary_metrics.json')
    with open(summary_filepath, 'w', encoding='utf-8') as f:
        json.dump(all_item_results, f, indent=4, ensure_ascii=False)
    print(f"\n✅ 所有项目的汇总指标已保存到: {summary_filepath}")

    # --- 计算并打印总体统计信息 ---
    # 过滤掉没有成功生成代码的项目，因为这些项目的相似度可能为0，影响平均值
    successful_generations = [r for r in all_item_results if r.get('metrics', {}).get('generation_success')]
    successful_renders = [r for r in all_item_results if r.get('metrics', {}).get('rendering_success')]

    total_generated_success = len(successful_generations)
    total_rendered_success = len(successful_renders)
    
    # 确保在计算平均值时只考虑有效的相似度分数
    valid_code_scores = [r['metrics']['code_similarity_score'] for r in successful_generations if r['metrics'].get('code_similarity_score') is not None]
    valid_visual_scores = [r['metrics']['visual_similarity_ssim_score'] for r in successful_renders if r['metrics'].get('visual_similarity_ssim_score') is not None]

    avg_code_sim = np.mean(valid_code_scores) if valid_code_scores else 0.0
    avg_visual_sim = np.mean(valid_visual_scores) if valid_visual_scores else 0.0

    print("\n--- 🚀 整体评估报告 (Summary Report) 🚀 ---")
    print(f"总处理项目数: {total_items}")
    print(f"成功生成代码的项目数: {total_generated_success}/{total_items} ({total_generated_success/total_items:.2%})")
    print(f"成功渲染页面的项目数: {total_rendered_success}/{total_items} ({total_rendered_success/total_items:.2%})")
    print(f"平均代码相似度 (针对成功生成的): {avg_code_sim:.4f}")
    print(f"平均视觉相似度 (SSIM, 针对成功渲染的): {avg_visual_sim:.4f}")
    print(f"\n详细结果请查看: {os.path.abspath(RESULTS_BASE_DIR)}")