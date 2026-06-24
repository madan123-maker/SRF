import re
import json

with open("pdf_extracted.txt", "r", encoding="utf-8") as f:
    text = f.read()

# Normalize spacing
text = re.sub(r'\r\n', '\n', text)

# Split by "Reform Area X:" or "Reform Area \d+:"
reform_areas = re.split(r'Reform Area \d+:', text)
parsed_areas = []

# Title mappings for the 7 Reform Areas
titles = [
    "Institutional Support",
    "Infrastructure Support",
    "Funding Opportunities",
    "Market Access & Reach",
    "Ecosystem Capacity Building",
    "Focus on Innovation & Sustainability",
    "Impact and Recognition"
]

for idx, ra in enumerate(reform_areas[1:]):
    title = titles[idx] if idx < len(titles) else f"Reform Area {idx+1}"
    
    # Let's extract the "Questions" block
    # Find text between "Questions" and "Scoring"
    q_section_match = re.search(r'Questions\s*\n(.*?)\n\s*(?:Scoring|Criteria|Absolute Scoring|Metric)', ra, re.DOTALL | re.IGNORECASE)
    if not q_section_match:
        # Fallback to general search if "Questions" section is not cleanly bounded
        q_section_match = re.search(r'Questions\s*\n(.*?)\n\s*(?:Document|Guidelines|---)', ra, re.DOTALL | re.IGNORECASE)
    
    questions = []
    if q_section_match:
        q_text = q_section_match.group(1)
        # Find all question lines starting with digit.digit (e.g. 1.1, 10.3, etc.)
        lines = q_text.split('\n')
        current_q = None
        for line in lines:
            line_strip = line.strip()
            if not line_strip:
                continue
            
            # Check if starts with a question number like "1.1" or "1.1.a" or "1.1 a"
            m = re.match(r'^(\d+\.\d+)\s*(.*)', line_strip)
            if m:
                if current_q:
                    questions.append(current_q)
                qnum = m.group(1)
                qbody = m.group(2).strip()
                current_q = {
                    "num": qnum,
                    "text": qbody
                }
            else:
                if current_q:
                    current_q["text"] += " " + line_strip
        if current_q:
            questions.append(current_q)
            
    parsed_areas.append({
        "id": f"ra_srf6_{idx+1}",
        "name": title,
        "description": f"DPIIT Framework 6.0 — {title}",
        "questions": questions
    })

print(json.dumps(parsed_areas, indent=2))
with open("srf6_parsed_questions.json", "w", encoding="utf-8") as out:
    json.dump(parsed_areas, out, indent=2, ensure_ascii=False)
