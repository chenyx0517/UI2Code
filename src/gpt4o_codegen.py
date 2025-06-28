import os
from dotenv import load_dotenv
from openai import OpenAI
import base64
import json 
from datetime import datetime 
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


def save_generated_result(
    output_dir: str,
    item_id: str,
    generated_code: str,
    screenshot_path: str,
    image_assets_info: str,
    model_name: str,
    system_prompt_content: str,
    user_prompt_content: str
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
    print(f"✅ 生成代码已保存到: {code_filepath}")

    # 保存输入截图的路径
    screenshot_path_filepath = os.path.join(item_output_dir, 'input_screenshot_path.txt')
    with open(screenshot_path_filepath, 'w', encoding='utf-8') as f:
        f.write(screenshot_path)

    # 保存输入给模型的图片资产列表
    image_assets_filepath = os.path.join(item_output_dir, 'input_image_assets.txt')
    with open(image_assets_filepath, 'w', encoding='utf-8') as f:
        f.write(image_assets_info)

    # 保存元数据
    metadata = {
        "timestamp": datetime.now().isoformat(),
        "item_id": item_id,
        "model_used": model_name,
        "input_screenshot_path": screenshot_path,
        "input_image_assets_info": image_assets_info,
        "system_prompt_used": system_prompt_content,
        "user_prompt_content_sent": user_prompt_content, # 实际发送给模型的用户prompt
        "generated_code_filepath": os.path.relpath(code_filepath, output_dir) # 相对路径
    }
    metadata_filepath = os.path.join(item_output_dir, 'metadata.json')
    with open(metadata_filepath, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, indent=4, ensure_ascii=False)
    print(f"✅ 元数据已保存到: {metadata_filepath}")



def generate_code_from_screenshot(screenshot_path: str, output_base_dir: str, model: str = "gpt-4o") -> str:
    if not os.path.exists(screenshot_path):
        return f"❌ 错误：截图文件不存在：{screenshot_path}"

    base64_image = encode_image(screenshot_path)
    image_assets_info = get_image_assets_list(screenshot_path)
    final_user_prompt_content = USER_PROMPT_TEMPLATE.format(image_assets_list=image_assets_info)

    # 提取 item_id (例如 'item_00001')
    # 假设截图路径格式为 .../ui2code_dataset/item_XXXXX/screenshot.png
    item_id = os.path.basename(os.path.dirname(screenshot_path))
    if not item_id.startswith("item_"): # 简单的检查，确保提取到正确的 item_id
        print(f"⚠️ 警告：无法从路径 {screenshot_path} 提取有效的 item_id。将使用 'unknown_item'。")
        item_id = "unknown_item"


    try:
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
            temperature=0.7,
            max_tokens=4000
        )
        generated_code = response.choices[0].message.content.strip()

        # --- 保存结果 ---
        save_generated_result(
            output_dir=output_base_dir,
            item_id=item_id,
            generated_code=generated_code,
            screenshot_path=screenshot_path,
            image_assets_info=image_assets_info,
            model_name=model,
            system_prompt_content=SYSTEM_PROMPT,
            user_prompt_content=final_user_prompt_content
        )

        return generated_code
    except Exception as e:
        return f"❌ 出错了：{e}"


# --- 主执行逻辑 (这部分保持不变) ---
if __name__ == "__main__":
    example_screenshot_path = "data/processed/ui2code_dataset/item_001/screenshot.png"

    # 定义结果保存的根目录
    # 每次运行可以生成一个带时间戳的子目录，方便管理
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    RESULTS_BASE_DIR = os.path.join('data', 'generated_results', f'run_{timestamp}')
    os.makedirs(RESULTS_BASE_DIR, exist_ok=True) # 确保结果目录存在

    print(f"🚀 尝试根据截图 {example_screenshot_path} 生成代码，并将结果保存到 {RESULTS_BASE_DIR}...")
    result = generate_code_from_screenshot(example_screenshot_path, output_base_dir=RESULTS_BASE_DIR)
    
    print("\n--- ✅ 生成的代码：---\n")
    print(result)
    print(f"\n所有生成结果已保存到目录: {RESULTS_BASE_DIR}")