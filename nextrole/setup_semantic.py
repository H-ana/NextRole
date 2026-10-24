"""One-time installation from PyPI and the pinned official Sentence Transformers repo."""
import hashlib
import json
import subprocess
import sys
import urllib.request
from pathlib import Path
from semantic_search import MODEL_DIR, MODEL_REVISION, MODEL_SHA256, MODEL_NAME

ROOT = Path(__file__).parent


def main():
    subprocess.run([sys.executable, '-m', 'pip', 'install', '--target', str(ROOT/'.local-deps'),
                    'numpy>=1.26,<3', 'onnxruntime>=1.20,<2', 'tokenizers>=0.21,<1',
                    '--disable-pip-version-check', '--no-warn-script-location'], check=True)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    for source, target in [('onnx/model_quint8_avx2.onnx','model.onnx'), ('tokenizer.json','tokenizer.json')]:
        destination = MODEL_DIR/target
        if destination.exists() and (target != 'model.onnx' or hashlib.sha256(destination.read_bytes()).hexdigest() == MODEL_SHA256):
            continue
        print('Downloading '+target+' from the official Sentence Transformers repository...', flush=True)
        request = urllib.request.Request(f'https://huggingface.co/{MODEL_NAME}/resolve/{MODEL_REVISION}/{source}', headers={'User-Agent':'NextRole-local-setup'})
        with urllib.request.urlopen(request, timeout=120) as response:
            payload = response.read(32_000_000)
        if target == 'model.onnx' and hashlib.sha256(payload).hexdigest() != MODEL_SHA256:
            raise RuntimeError('Model checksum mismatch; download was not installed.')
        if target == 'tokenizer.json':
            json.loads(payload)
        temporary = destination.with_suffix('.download')
        temporary.write_bytes(payload)
        temporary.replace(destination)
    from semantic_search import ENCODER
    vectors = ENCODER.encode(['Automated reconciliation workflows', 'Process automation', 'Restaurant food preparation'])
    similarity = lambda a,b:sum(x*y for x,y in zip(a,b))
    if similarity(vectors[0],vectors[1]) <= similarity(vectors[0],vectors[2]):
        raise RuntimeError('Semantic similarity smoke check failed.')
    print('Local semantic search is ready. Resume text stays on this computer during ranking.', flush=True)


if __name__ == '__main__':
    main()
