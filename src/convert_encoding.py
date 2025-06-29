# convert_encoding.py
import os

# 定义要转换编码的 prompt 文件路径
# 假设 convert_encoding.py 和 src 目录在同一级别
prompt_files = [
    os.path.join('src', 'prompts', 'ui2code_system_prompt.txt'),
    os.path.join('src', 'prompts', 'ui2code_user_template.txt')
]

print("🚀 开始检查并转换 Prompt 文件的编码到 UTF-8...")

for filepath in prompt_files:
    if not os.path.exists(filepath):
        print(f"⚠️ 警告：文件未找到，跳过：{filepath}")
        continue

    print(f"处理文件: {filepath}")
    try:
        # 尝试以 UTF-8 编码读取。如果成功，说明已经是 UTF-8，无需转换。
        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()
        print(f"  - 文件 {filepath} 已经是 UTF-8 编码，无需转换。")

    except UnicodeDecodeError:
        # 如果以 UTF-8 读取失败，说明是其他编码（例如 GBK），尝试以 GBK 读取
        print(f"  - 文件 {filepath} 不是 UTF-8 编码，尝试以 GBK 读取并转换...")
        try:
            with open(filepath, 'r', encoding='gbk', errors='replace') as f: # errors='replace' 处理无法解码的字符
                content = f.read()
            
            # 以 UTF-8 编码重新写入文件，这将强制转换编码
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"  ✅ 文件 {filepath} 已成功转换为 UTF-8 编码。")

        except Exception as e:
            print(f"  ❌ 转换文件 {filepath} 失败：{e}")
    
    except Exception as e:
        print(f"  ❌ 读取文件 {filepath} 时发生未知错误：{e}")

print("\n🎉 编码转换过程完成。现在请尝试运行您的主脚本。")