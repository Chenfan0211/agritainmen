# -*- coding: utf-8 -*-
"""将 功能清单实现状态-按端归组.md 转换为 Word 文档。"""
from pathlib import Path
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
MD = ROOT / "docs" / "功能清单实现状态-按端归组.md"
OUT = ROOT / "功能清单-按端归组.docx"

GREEN = RGBColor(0x1D, 0x6B, 0x44)
DARK = RGBColor(0x13, 0x3F, 0x2B)
CHARCOAL = RGBColor(0x25, 0x2A, 0x27)
GRAY = RGBColor(0x67, 0x70, 0x69)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)
HEADER_FILL = "1D6B44"
SECTION_FILL = "E8F1EB"
ALT_FILL = "F6F8F6"

def set_cell_bg(cell, color):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), color)
    tcPr.append(shd)

def set_cell_text(cell, text, bold=False, color=None, size=10.5):
    cell.text = ""
    p = cell.paragraphs[0]
    run = p.add_run(text)
    run.bold = bold
    run.font.size = Pt(size)
    run.font.name = '微软雅黑'
    run._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
    if color is not None:
        run.font.color.rgb = color

def parse_md(path):
    """解析 Markdown，返回 [(kind, text)]，kind: h1/h2/h3/para/table"""
    lines = path.read_text(encoding='utf-8').splitlines()
    items = []
    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line.strip():
            i += 1
            continue
        if line.startswith('|'):
            # 收集表格
            table = []
            while i < len(lines) and lines[i].strip().startswith('|'):
                row = [c.strip() for c in lines[i].strip().strip('|').split('|')]
                table.append(row)
                i += 1
            # 去掉分隔行（---|---）
            table = [r for r in table if not all(set(c) <= set('-: ') and c for c in r)]
            items.append(('table', table))
            continue
        if line.startswith('# '):
            items.append(('h1', line[2:].strip()))
        elif line.startswith('## '):
            items.append(('h2', line[3:].strip()))
        elif line.startswith('### '):
            items.append(('h3', line[4:].strip()))
        elif line.startswith('#### '):
            items.append(('h4', line[5:].strip()))
        elif line.startswith('>'):
            items.append(('quote', line.lstrip('> ').strip()))
        elif line.startswith('---'):
            pass
        else:
            items.append(('para', line.strip()))
        i += 1
    return items

def main():
    items = parse_md(MD)
    doc = Document()

    # 页面设置
    section = doc.sections[0]
    section.top_margin = Cm(2.0)
    section.bottom_margin = Cm(2.0)
    section.left_margin = Cm(2.0)
    section.right_margin = Cm(2.0)

    # 默认字体
    style = doc.styles['Normal']
    style.font.name = '微软雅黑'
    style.font.size = Pt(10.5)
    style.element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')

    for kind, content in items:
        if kind == 'h1':
            p = doc.add_paragraph()
            run = p.add_run(content)
            run.bold = True
            run.font.size = Pt(22)
            run.font.color.rgb = DARK
            run.font.name = '微软雅黑'
            run._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        elif kind == 'h2':
            p = doc.add_paragraph()
            run = p.add_run(content)
            run.bold = True
            run.font.size = Pt(15)
            run.font.color.rgb = GREEN
            run.font.name = '微软雅黑'
            run._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
            p.paragraph_format.space_before = Pt(14)
            p.paragraph_format.space_after = Pt(6)
        elif kind == 'h3':
            p = doc.add_paragraph()
            run = p.add_run(content)
            run.bold = True
            run.font.size = Pt(12.5)
            run.font.color.rgb = CHARCOAL
            run.font.name = '微软雅黑'
            run._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
            p.paragraph_format.space_before = Pt(10)
            p.paragraph_format.space_after = Pt(4)
        elif kind == 'h4':
            p = doc.add_paragraph()
            run = p.add_run(content)
            run.bold = True
            run.font.size = Pt(11)
            run.font.color.rgb = RGBColor(0x3B, 0x5C, 0x4A)
            run.font.name = '微软雅黑'
            run._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(2)
        elif kind == 'quote':
            p = doc.add_paragraph()
            run = p.add_run(content)
            run.italic = True
            run.font.size = Pt(9.5)
            run.font.color.rgb = GRAY
            run.font.name = '微软雅黑'
            run._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
        elif kind == 'para':
            p = doc.add_paragraph()
            run = p.add_run(content)
            run.font.size = Pt(10.5)
            run.font.color.rgb = CHARCOAL
            run.font.name = '微软雅黑'
            run._element.rPr.rFonts.set(qn('w:eastAsia'), '微软雅黑')
        elif kind == 'table':
            if not content:
                continue
            ncol = len(content[0])
            tbl = doc.add_table(rows=len(content), cols=ncol)
            tbl.style = 'Table Grid'
            tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
            for ri, row in enumerate(content):
                # 补齐列数
                while len(row) < ncol:
                    row.append('')
                for ci, val in enumerate(row[:ncol]):
                    cell = tbl.cell(ri, ci)
                    is_header = (ri == 0)
                    set_cell_text(cell, val, bold=is_header,
                                  color=(WHITE if is_header else CHARCOAL),
                                  size=(10.5 if is_header else 10))
                    if is_header:
                        set_cell_bg(cell, HEADER_FILL)
                    elif ri % 2 == 0:
                        set_cell_bg(cell, ALT_FILL)
            doc.add_paragraph().paragraph_format.space_after = Pt(2)

    doc.save(OUT)
    print(f"已生成: {OUT}")

if __name__ == '__main__':
    main()
