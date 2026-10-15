"""Turn an event folder or .zip (Word / Excel / PowerPoint / PDF / text) into plain-text documents.

Nothing inside the archive is executed: macros in .xlsm files are never loaded, design sources
(.psd/.ai) and images are listed but not parsed, and zip paths are checked against zip-slip.
"""

from __future__ import annotations

import re
import shutil
import zipfile
from pathlib import Path

import docx
import openpyxl
from pptx import Presentation
from pypdf import PdfReader

TEXT_EXT = {".docx", ".xlsx", ".xlsm", ".pptx", ".pdf", ".txt", ".md", ".csv"}
SKIP_EXT = {".psd", ".ai", ".indd", ".sketch", ".fig"}
MAX_FILE_BYTES = 30 * 1024 * 1024

# instruction-shaped text aimed at an AI reader inside a document = possible prompt injection
INJECTION_PATTERNS = [
    r"ignore (all |any )?(previous|prior|above) (instructions|rules)",
    r"disregard (the|all|your) (instructions|rules|system)",
    r"\b(system prompt|developer message)\b",
    r"\byou are (now )?(an?|the) (ai|assistant|agent)\b",
    r"\b(ai|assistant|agent|reviewer)s?\s*[:,]\s*(please )?(mark|rate|approve|send|forward|add|rank|reply)\b",
    r"忽略(之前|以上|前面)的?(所有)?(指令|指示|规则)",
    r"(AI|助手|智能体)[，,:：]?\s*请(直接)?(批准|发送|转发|标记|评为)",
]


def _decode_name(info: zipfile.ZipInfo) -> str:
    name = info.filename
    if not info.flag_bits & 0x800:  # macOS/Google Drive zips often store UTF-8 names without the flag
        try:
            name = name.encode("cp437").decode("utf-8")
        except (UnicodeEncodeError, UnicodeDecodeError):
            pass
    return name


def unpack(zip_path: Path, dest: Path) -> Path:
    """Extract a zip into dest (fresh), skipping design sources; returns dest."""
    if dest.exists():
        shutil.rmtree(dest)
    dest.mkdir(parents=True)
    root = dest.resolve()
    with zipfile.ZipFile(zip_path) as z:
        for info in z.infolist():
            name = _decode_name(info)
            if name.endswith("/") or Path(name).suffix.lower() in SKIP_EXT or "__MACOSX" in name:
                continue
            if info.file_size > MAX_FILE_BYTES:
                continue
            target = (dest / name).resolve()
            if not str(target).startswith(str(root)):
                continue  # zip-slip
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(z.read(info))
    return dest


def _docx(p: Path) -> str:
    d = docx.Document(str(p))
    lines = [para.text for para in d.paragraphs if para.text.strip()]
    for t in d.tables:
        for row in t.rows:
            cells = []
            for c in row.cells:  # merged cells repeat; keep each value once per row
                v = c.text.strip()
                if v and v not in cells:
                    cells.append(v)
            if cells:
                lines.append(" | ".join(cells))
    return "\n".join(lines)


def _xlsx(p: Path) -> str:
    wb = openpyxl.load_workbook(str(p), read_only=True, data_only=True, keep_vba=False)
    lines = []
    for ws in wb.worksheets:
        rows = []
        for row in ws.iter_rows(values_only=True):
            vals = ["" if v is None else str(v).replace("\n", " ").strip() for v in row]
            while vals and not vals[-1]:
                vals.pop()
            if any(vals):
                rows.append(" | ".join(vals))
        if rows:
            lines.append(f"### sheet: {ws.title}")
            lines.extend(rows)
    return "\n".join(lines)


def _pptx(p: Path) -> str:
    out = []
    for i, s in enumerate(Presentation(str(p)).slides, 1):
        texts = [sh.text_frame.text for sh in s.shapes if sh.has_text_frame and sh.text_frame.text.strip()]
        if texts:
            out.append(f"### slide {i}\n" + "\n".join(texts))
    return "\n".join(out)


def _pdf(p: Path) -> str:
    return "\n".join((pg.extract_text() or "") for pg in PdfReader(str(p)).pages)


READERS = {".docx": _docx, ".xlsx": _xlsx, ".xlsm": _xlsx, ".pptx": _pptx, ".pdf": _pdf}


def classify(rel: str, text: str) -> str:
    low = rel.lower()
    sheet = low.endswith((".xlsx", ".xlsm", ".csv"))
    if any(w in low for w in ("报销", "報銷", "receipt", "expense", "budget", "reimburs", "账单", "帳單")) or \
            ("operation" in low and sheet):
        return "finance"
    if sheet and any(w in low for w in ("tracker", "list", "名单", "名單", "roster", "guest")):
        return "roster"
    if any(w in low for w in ("邀请", "邀請", "invitation", "invite")):
        return "invitation"
    if any(w in low for w in ("sponsor", "赞助", "贊助", "prospectus")):
        return "sponsorship"
    if any(w in low for w in ("flyer", "宣传", "宣傳", "poster", "promo")):
        return "promotion"
    if any(w in low for w in ("proposal", "notes", "plan", "典礼", "典禮", "agenda", "议程", "議程")):
        return "planning"
    return "sheet" if sheet else "other"


def injection_flags(text: str) -> list[str]:
    hits = []
    for pat in INJECTION_PATTERNS:
        for m in re.finditer(pat, text, flags=re.IGNORECASE):
            s = max(m.start() - 40, 0)
            hits.append(text[s:m.end() + 60].replace("\n", " "))
    return hits[:5]


def read_folder(folder: Path) -> tuple[list[dict], list[str]]:
    """Return (documents, other_files). Each document: path, kind, text, chars, flags."""
    docs, others = [], []
    for f in sorted(folder.rglob("*")):
        if not f.is_file() or f.name.startswith(("~$", ".")):
            continue
        rel = str(f.relative_to(folder))
        ext = f.suffix.lower()
        if ext not in TEXT_EXT:
            others.append(rel)
            continue
        try:
            text = READERS[ext](f) if ext in READERS else f.read_text(errors="replace")
        except Exception as exc:  # noqa: BLE001 - a broken file should not stop the import
            text = f"[could not read: {exc}]"
        text = re.sub(r"[ \t]+\n", "\n", text).strip()
        docs.append({"path": rel, "kind": classify(rel, text), "text": text, "chars": len(text),
                     "flags": injection_flags(text)})
    return docs, others
