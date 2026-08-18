"""Phase 2b, steps 2-3: chunk the reference corpus, embed it, and build a
FAISS index for retrieval.

Run this once (or whenever rag_corpus/ changes) to (re)build the index.
retriever.py loads the resulting index at runtime - it does not embed on
every request.

Embeddings: local sentence-transformers (all-MiniLM-L6-v2) - no external
API key, no per-call cost, consistent with this project's free-tier/no-spend
posture (see docs/NOVELTY_PLAN.md Phase 4). Vector store: FAISS - lighter
dependency than Chroma, no persistence server to manage, fine for a small
static corpus.
"""
import json
import re
from pathlib import Path

import faiss
import numpy as np
from sentence_transformers import SentenceTransformer

CORPUS_DIR = Path(__file__).resolve().parent / "rag_corpus"
INDEX_DIR = Path(__file__).resolve().parent / "rag_index"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"
CHUNK_MIN_CHARS = 200  # merge short trailing chunks into the previous one


def parse_frontmatter(text):
    """Splits a corpus file's YAML-ish frontmatter (between --- lines) from
    its body. Minimal hand-rolled parser - the frontmatter here is flat
    key: value pairs, doesn't need a full YAML library."""
    match = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.DOTALL)
    if not match:
        return {}, text
    meta_block, body = match.groups()
    meta = {}
    for line in meta_block.splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            meta[key.strip()] = value.strip()
    return meta, body


def chunk_by_heading(body):
    """Splits on markdown ## headings - each section becomes one chunk.
    Sections are naturally topic-coherent (Epidemiology, Imaging
    Characteristics, etc.), which makes for better retrieval granularity
    than fixed-size character chunking on clinical reference text."""
    sections = re.split(r"\n(?=## )", body.strip())
    chunks = []
    for section in sections:
        section = section.strip()
        if not section:
            continue
        heading_match = re.match(r"^## (.+)$", section, re.MULTILINE)
        heading = heading_match.group(1) if heading_match else "Overview"
        chunks.append((heading, section))
    return chunks


def build_index():
    print(f"Loading embedding model: {EMBEDDING_MODEL}...")
    model = SentenceTransformer(EMBEDDING_MODEL)

    all_chunks = []  # list of {text, topic, heading, source, source_url}
    for path in sorted(CORPUS_DIR.glob("*.md")):
        text = path.read_text(encoding="utf-8")
        meta, body = parse_frontmatter(text)
        for heading, section_text in chunk_by_heading(body):
            all_chunks.append({
                "text": section_text,
                "topic": meta.get("topic", path.stem),
                "heading": heading,
                "source": meta.get("source", "unknown"),
                "source_url": meta.get("source_url", ""),
            })
        print(f"  {path.name}: {len(chunk_by_heading(body))} chunks")

    print(f"\nTotal chunks: {len(all_chunks)}")
    print("Embedding chunks...")
    texts = [c["text"] for c in all_chunks]
    embeddings = model.encode(texts, show_progress_bar=True, normalize_embeddings=True)
    embeddings = np.array(embeddings, dtype="float32")

    dim = embeddings.shape[1]
    index = faiss.IndexFlatIP(dim)  # inner product on normalized vectors = cosine similarity
    index.add(embeddings)

    INDEX_DIR.mkdir(exist_ok=True)
    faiss.write_index(index, str(INDEX_DIR / "corpus.faiss"))
    with open(INDEX_DIR / "chunks.json", "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, indent=2)

    print(f"\nWrote FAISS index ({index.ntotal} vectors, dim={dim}) to {INDEX_DIR / 'corpus.faiss'}")
    print(f"Wrote chunk metadata to {INDEX_DIR / 'chunks.json'}")


if __name__ == "__main__":
    build_index()
