"""Phase 2b: retrieval over the curated medical reference corpus.

Loads the FAISS index built by build_rag_index.py lazily, on first retrieve()
call rather than at import time - sentence-transformers' model download/load
was adding enough synchronous startup time to make the container miss
Render's port-scan window. Still a singleton: loaded once, reused after.
"""
import json
from pathlib import Path

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

INDEX_DIR = Path(__file__).resolve().parent / "rag_index"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"


class Retriever:
    def __init__(self):
        self.model = None
        self.index = None
        self.chunks = []
        self._loaded = False

    def _ensure_loaded(self):
        if self._loaded:
            return
        self._loaded = True
        self._load()

    def _load(self):
        index_path = INDEX_DIR / "corpus.faiss"
        chunks_path = INDEX_DIR / "chunks.json"
        if not index_path.exists() or not chunks_path.exists():
            print(f"Warning: RAG index not found at {INDEX_DIR}. "
                  f"Run build_rag_index.py first. Retrieval will return no results.")
            return
        try:
            self.model = SentenceTransformer(EMBEDDING_MODEL)
            self.index = faiss.read_index(str(index_path))
            with open(chunks_path, encoding="utf-8") as f:
                self.chunks = json.load(f)
            print(f"RAG index loaded: {len(self.chunks)} chunks from {INDEX_DIR}")
        except Exception as e:
            print(f"Error loading RAG index: {e}")
            self.model = None

    def retrieve(self, query: str, top_k: int = 3, min_score: float = 0.35):
        """Returns up to top_k chunks (dicts with text/topic/heading/source/
        source_url/score) above min_score cosine similarity. Returns an
        empty list if the index isn't loaded or nothing clears the
        threshold - callers should treat "no relevant passages" as a valid
        outcome, not an error, since not every question needs grounding."""
        self._ensure_loaded()
        if self.model is None or self.index is None or self.index.ntotal == 0:
            return []

        query_vec = self.model.encode([query], normalize_embeddings=True).astype("float32")
        scores, indices = self.index.search(query_vec, top_k)

        results = []
        for score, idx in zip(scores[0], indices[0]):
            if idx == -1 or score < min_score:
                continue
            chunk = dict(self.chunks[idx])
            chunk["score"] = float(score)
            results.append(chunk)
        return results


# Singleton instance
retriever = Retriever()
