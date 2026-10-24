"""Local sentence embeddings. No resume text or query vectors are written to disk."""
import collections
import hashlib
import importlib
import json
import math
import re
import sys
import threading
from pathlib import Path

ROOT = Path(__file__).parent
DEPS = ROOT / '.local-deps'
if str(DEPS) not in sys.path:
    sys.path.insert(0, str(DEPS))
MODEL_REVISION = '1110a243fdf4706b3f48f1d95db1a4f5529b4d41'
MODEL_NAME = 'sentence-transformers/all-MiniLM-L6-v2'
MODEL_VERSION = MODEL_NAME + '@' + MODEL_REVISION + ':chunks-v1'
MODEL_DIR = ROOT / '.models' / 'minilm'
MODEL_SHA256 = 'b941bf19f1f1283680f449fa6a7336bb5600bdcd5f84d10ddc5cd72218a0fd21'


def chunks(text, size=110, overlap=20):
    words = str(text).split()
    return [' '.join(words[i:i+size]) for i in range(0, len(words), size-overlap)] or ['']


def normalize(vector):
    length = math.sqrt(sum(float(v)*float(v) for v in vector)) or 1
    return [float(v)/length for v in vector]


class SemanticEncoder:
    def __init__(self):
        self.lock = threading.RLock()
        self.session = None
        self.query_cache = collections.OrderedDict()
        self.error = None

    def load(self):
        with self.lock:
            if self.session is not None:
                return True
            if not (MODEL_DIR/'model.onnx').is_file() or not (MODEL_DIR/'tokenizer.json').is_file():
                self.error = 'Run python setup_semantic.py once to install local semantic search.'
                return False
            try:
                importlib.invalidate_caches()
                import numpy as np
                import onnxruntime as ort
                from tokenizers import Tokenizer
                self.np = np
                self.tokenizer = Tokenizer.from_file(str(MODEL_DIR/'tokenizer.json'))
                self.tokenizer.enable_truncation(max_length=256)
                self.tokenizer.enable_padding()
                options = ort.SessionOptions()
                options.intra_op_num_threads = 2
                self.session = ort.InferenceSession(str(MODEL_DIR/'model.onnx'), sess_options=options, providers=['CPUExecutionProvider'])
                self.error = None
                return True
            except (ImportError, OSError, RuntimeError, ValueError):
                self.error = 'Local semantic model could not load. Run python setup_semantic.py, then restart the backend.'
                return False

    def status(self):
        return {'ready': self.session is not None, 'model': MODEL_NAME, 'message': self.error}

    def encode(self, texts):
        if not self.load():
            raise RuntimeError(self.error)
        with self.lock:
            result = []
            for start in range(0, len(texts), 16):
                encoded = self.tokenizer.encode_batch(texts[start:start+16])
                np = self.np
                values = {'input_ids': np.array([e.ids for e in encoded], dtype=np.int64),
                          'attention_mask': np.array([e.attention_mask for e in encoded], dtype=np.int64),
                          'token_type_ids': np.array([e.type_ids for e in encoded], dtype=np.int64)}
                output = self.session.run(None, {i.name: values[i.name] for i in self.session.get_inputs()})[0]
                if output.ndim == 3:
                    mask = values['attention_mask'][:, :, None]
                    output = (output*mask).sum(axis=1)/np.maximum(mask.sum(axis=1), 1)
                result.extend(normalize(row.tolist()) for row in output)
            return result

    def query_vectors(self, text):
        key = hashlib.sha256(text.encode()).hexdigest()
        with self.lock:
            if key in self.query_cache:
                self.query_cache.move_to_end(key)
                return self.query_cache[key]
        vectors = self.encode(chunks(text))
        with self.lock:
            self.query_cache[key] = vectors
            while len(self.query_cache) > 8:
                self.query_cache.popitem(last=False)
        return vectors


def semantic_score(query, document):
    # Match multiple demonstrated responsibilities, rather than just the title.
    try:
        import numpy as np
        best = (np.asarray(query,dtype=np.float32) @ np.asarray(document,dtype=np.float32).T).max(axis=1).tolist() if document else [0]*len(query)
    except ImportError:
        best = [max((sum(x*y for x,y in zip(q,d)) for d in document), default=0) for q in query]
    best = sorted(best, reverse=True)[:min(6, len(best))]
    return max(0, sum(best)/max(1,len(best)))


def lexical_scores(query, jobs):
    stop = set('the and with for from this that your have has are was were will into about their they work team years experience'.split())
    words = lambda text: [w for w in re.findall(r'[a-z][a-z0-9+#.-]{1,}', text.lower()) if w not in stop]
    query = collections.Counter(words(query))
    docs = [collections.Counter(words(job['title']*3+' '+job['description'])) for job in jobs]
    df = collections.Counter(w for doc in docs for w in doc)
    scores = [sum(min(n,3)*math.log(1+len(docs)/(1+df[w]))*doc[w]/(doc[w]+1.2+sum(doc.values())/1500) for w,n in query.items() if w in doc) for doc in docs]
    maximum = max(scores, default=0) or 1
    return [score/maximum for score in scores]


ENCODER = SemanticEncoder()
