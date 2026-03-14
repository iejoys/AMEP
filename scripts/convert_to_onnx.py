#!/usr/bin/env python3
"""
BGE-small-zh-v1.5 转 ONNX 格式
适配 @huggingface/transformers

运行:
  pip install optimum[onnx] transformers onnxruntime
  python scripts/convert_to_onnx.py
"""

import os
import json

# 设置国内镜像
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"

from optimum.onnxruntime import ORTModelForFeatureExtraction
from transformers import AutoTokenizer


def convert_to_onnx():
    print("=== BGE-small-zh-v1.5 转 ONNX ===\n")

    model_name = "BAAI/bge-small-zh-v1.5"
    output_dir = "./models/bge-small-zh-v1.5-onnx"

    # 创建输出目录
    os.makedirs(output_dir, exist_ok=True)

    # 使用 optimum 导出 ONNX
    print("1. 加载并转换模型 (使用 hf-mirror.com)...")
    print("   这可能需要几分钟...")

    model = ORTModelForFeatureExtraction.from_pretrained(
        model_name,
        export=True,
    )
    tokenizer = AutoTokenizer.from_pretrained(model_name)

    # 保存
    model.save_pretrained(output_dir)
    tokenizer.save_pretrained(output_dir)
    print(f"   模型已保存到: {output_dir}\n")

    # 创建 transformers.js 需要的配置
    print("2. 创建配置文件...")

    # 读取原始配置并修改
    config_path = os.path.join(output_dir, "config.json")
    with open(config_path, "r", encoding="utf-8") as f:
        config = json.load(f)

    # 添加 transformers.js 需要的字段
    config["architectures"] = ["BertModel"]
    config["model_type"] = "bert"

    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)

    print(f"   配置已更新\n")

    # 列出文件
    print("3. 输出文件:")
    for f in os.listdir(output_dir):
        fpath = os.path.join(output_dir, f)
        size = os.path.getsize(fpath) / 1024 / 1024
        print(f"   - {f} ({size:.2f} MB)")

    print("\n=== 转换完成 ===")
    print(f"\n使用方式:")
    print(f"  embedding: {{")
    print(f"    modelType: 'bge-small-zh',")
    print(f"    modelPath: '{os.path.abspath(output_dir)}',")
    print(f"  }}")


if __name__ == "__main__":
    convert_to_onnx()
