"""
从 ModelScope 下载 BGE-small-en-v1.5 模型
"""

from modelscope import snapshot_download
import os
import shutil

# 下载模型到本地目录
model_dir = snapshot_download(
    'Xorbits/bge-small-en-v1.5',
    cache_dir='./models'
)

print(f"模型已下载到: {model_dir}")

# 列出下载的文件
for root, dirs, files in os.walk(model_dir):
    for f in files:
        print(f"  {os.path.join(root, f)}")