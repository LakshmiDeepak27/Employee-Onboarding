import os
from PIL import Image, ImageDraw, ImageFont

# Canvas dimensions
WIDTH = 2400
HEIGHT = 1450
IMG_SIZE = (WIDTH, HEIGHT)

# Create canvas
img = Image.new("RGBA", IMG_SIZE, "#F8FAFC")
draw = ImageDraw.Draw(img)

# Try loading fonts, fallback to default
try:
    font_title = ImageFont.truetype("segoeuib.ttf", 46)
    font_subtitle = ImageFont.truetype("segoeui.ttf", 22)
    font_sec_title = ImageFont.truetype("segoeuib.ttf", 26)
    font_card_title = ImageFont.truetype("segoeuib.ttf", 22)
    font_bold = ImageFont.truetype("segoeuib.ttf", 18)
    font_regular = ImageFont.truetype("segoeui.ttf", 17)
    font_small = ImageFont.truetype("segoeui.ttf", 15)
    font_mono = ImageFont.truetype("consola.ttf", 16)
except Exception:
    font_title = ImageFont.load_default()
    font_subtitle = font_title
    font_sec_title = font_title
    font_card_title = font_title
    font_bold = font_title
    font_regular = font_title
    font_small = font_title
    font_mono = font_title

# Helper functions
def draw_rounded_rect(xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

def draw_pill(x, y, w, h, fill, text, text_color, font):
    draw_rounded_rect((x, y, x + w, y + h), radius=h//2, fill=fill)
    bbox = font.getbbox(text)
    tw = bbox[2] - bbox[0]
    th = bbox[3] - bbox[1]
    draw.text((x + (w - tw)/2, y + (h - th)/2 - 2), text, fill=text_color, font=font)

def draw_card(x, y, w, h, bg_color, border_color, title, title_color, badge_text="", badge_bg="#2563EB"):
    draw_rounded_rect((x, y, x + w, y + h), radius=14, fill=bg_color, outline=border_color, width=2)
    # Header bar
    draw.text((x + 20, y + 16), title, fill=title_color, font=font_card_title)
    if badge_text:
        bbox = font_small.getbbox(badge_text)
        bw = bbox[2] - bbox[0] + 20
        draw_pill(x + w - bw - 20, y + 16, bw, 26, badge_bg, badge_text, "#FFFFFF", font_small)
    # Divider line
    draw.line((x + 20, y + 54, x + w - 20, y + 54), fill=border_color, width=1)

# ==================== HEADER ====================
# Top Header Banner
draw_rounded_rect((40, 30, WIDTH - 40, 140), radius=16, fill="#0F172A")

# Brand icon circle
draw_rounded_rect((70, 52, 146, 128), radius=38, fill="#2563EB")
draw.text((93, 62), "C", fill="#FFFFFF", font=ImageFont.truetype("segoeuib.ttf", 46) if font_title != ImageFont.load_default() else font_title)

# Header text
draw.text((165, 48), "CLYORA", fill="#FFFFFF", font=font_title)
draw.text((365, 52), "·  Enterprise Onboarding Orchestration Architecture", fill="#94A3B8", font=font_sec_title)

# Acronym full form
acronym_text = "C.L.Y.O.R.A. = Coordinated Lifecycle & Yield Orchestrator for Readiness & Alignment"
draw.text((165, 104), acronym_text, fill="#38BDF8", font=font_bold)

# Motto pill
draw_pill(WIDTH - 580, 68, 510, 38, "#1E293B", "AI Coordinates · Rules Constrain · Humans Decide", "#E2E8F0", font_bold)

# ==================== TIER 1: PRESENTATION & ROLES ====================
y_tier1 = 160
draw_rounded_rect((40, y_tier1, WIDTH - 40, y_tier1 + 250), radius=18, fill="#FFFFFF", outline="#E2E8F0", width=2)
draw.text((65, y_tier1 + 16), "TIER 1: PRESENTATION & USER WORKSPACES (React + Vite Single-Page Application)", fill="#0F172A", font=font_sec_title)

# 4 Roles + AI widget side-by-side
role_w = 425
role_h = 160
role_gap = 25
start_x = 65

# Role 1: HR Admin
rx = start_x
draw_rounded_rect((rx, y_tier1 + 60, rx + role_w, y_tier1 + 60 + role_h), radius=12, fill="#EFF6FF", outline="#93C5FD", width=2)
draw.text((rx + 16, y_tier1 + 72), "1. HR ADMINISTRATOR", fill="#1D4ED8", font=font_bold)
draw_pill(rx + role_w - 95, y_tier1 + 70, 80, 24, "#2563EB", "Full Scope", "#FFFFFF", font_small)
draw.text((rx + 16, y_tier1 + 104), "• Creates employee profile & sets location", fill="#1E293B", font=font_regular)
draw.text((rx + 16, y_tier1 + 128), "• Initiates & approves onboarding plan", fill="#1E293B", font=font_regular)
draw.text((rx + 16, y_tier1 + 152), "• Verifies documents, payroll & benefits", fill="#1E293B", font=font_regular)
draw.text((rx + 16, y_tier1 + 176), "• Final sign-off: Activates employee", fill="#1E293B", font=font_regular)

# Role 2: Employee
rx += role_w + role_gap
draw_rounded_rect((rx, y_tier1 + 60, rx + role_w, y_tier1 + 60 + role_h), radius=12, fill="#F0FDF4", outline="#86EFAC", width=2)
draw.text((rx + 16, y_tier1 + 72), "2. EMPLOYEE", fill="#15803D", font=font_bold)
draw_pill(rx + role_w - 95, y_tier1 + 70, 80, 24, "#16A34A", "Self Scope", "#FFFFFF", font_small)
draw.text((rx + 16, y_tier1 + 104), "• Uploads mandatory identity documents", fill="#1E293B", font=font_regular)
draw.text((rx + 16, y_tier1 + 128), "• Submits masked payroll & bank info", fill="#1E293B", font=font_regular)
draw.text((rx + 16, y_tier1 + 152), "• Takes training lessons & passes quiz", fill="#1E293B", font=font_regular)
draw.text((rx + 16, y_tier1 + 176), "• Acknowledges equipment delivery", fill="#1E293B", font=font_regular)

# Role 3: IT Admin
rx += role_w + role_gap
draw_rounded_rect((rx, y_tier1 + 60, rx + role_w, y_tier1 + 60 + role_h), radius=12, fill="#FFFBEB", outline="#FDE68A", width=2)
draw.text((rx + 16, y_tier1 + 72), "3. IT ADMINISTRATOR", fill="#B45309", font=font_bold)
draw_pill(rx + role_w - 95, y_tier1 + 70, 80, 24, "#D97706", "IT Scope", "#FFFFFF", font_small)
draw.text((rx + 16, y_tier1 + 104), "• Manages equipment inventory catalog", fill="#1E293B", font=font_regular)
draw.text((rx + 16, y_tier1 + 128), "• Checks stock & prevents duplicate allocation", fill="#1E293B", font=font_regular)
draw.text((rx + 16, y_tier1 + 152), "• Reserves hardware (Laptop / Monitor)", fill="#1E293B", font=font_regular)
draw.text((rx + 16, y_tier1 + 176), "• Dispatches with serial & tracking number", fill="#1E293B", font=font_regular)

# Role 4: Manager
rx += role_w + role_gap
draw_rounded_rect((rx, y_tier1 + 60, rx + role_w, y_tier1 + 60 + role_h), radius=12, fill="#FAF5FF", outline="#D8B4FE", width=2)
draw.text((rx + 16, y_tier1 + 72), "4. REPORTING MANAGER", fill="#7E22CE", font=font_bold)
draw_pill(rx + role_w - 110, y_tier1 + 70, 95, 24, "#9333EA", "Team Scope", "#FFFFFF", font_small)
draw.text((rx + 16, y_tier1 + 104), "• Selects & assigns onboarding peer buddy", fill="#1E293B", font=font_regular)
draw.text((rx + 16, y_tier1 + 128), "• Formulates Day-One team welcome agenda", fill="#1E293B", font=font_regular)
draw.text((rx + 16, y_tier1 + 152), "• Schedules 1:1 and team intro meetings", fill="#1E293B", font=font_regular)
draw.text((rx + 16, y_tier1 + 176), "• Reviews team readiness blockers", fill="#1E293B", font=font_regular)

# AI Chat launcher badge
draw_pill(WIDTH - 550, y_tier1 + 14, 480, 32, "#1D64EC", "✨ Ask CLYORA · Grounded AI Assistant Floating Widget", "#FFFFFF", font_small)


# ==================== CONNECTING API BUS ====================
y_bus = 430
draw_rounded_rect((40, y_bus, WIDTH - 40, y_bus + 50), radius=10, fill="#1E293B")
draw.text((WIDTH//2 - 340, y_bus + 14), "REST API & SECURE JWT / OIDC SESSION LAYER  (/api/v1/*)", fill="#FFFFFF", font=font_bold)
draw.text((80, y_bus + 15), "Role-Based Access Control (RBAC)", fill="#38BDF8", font=font_small)
draw.text((WIDTH - 360, y_bus + 15), "Fail-Closed Database Health Guard", fill="#38BDF8", font=font_small)


# ==================== TIER 2: ORCHESTRATION ENGINE ====================
y_tier2 = 505
h_tier2 = 470
draw_rounded_rect((40, y_tier2, WIDTH - 40, y_tier2 + h_tier2), radius=18, fill="#FFFFFF", outline="#CBD5E1", width=2)
draw.text((65, y_tier2 + 18), "TIER 2: ORCHESTRATION ENGINE & GOVERNANCE HARNESS (Express.js + TypeScript)", fill="#0F172A", font=font_sec_title)

col_y = y_tier2 + 65
col_h = 380

# Column A: The 6 Service Modules
col_a_w = 700
draw_rounded_rect((65, col_y, 65 + col_a_w, col_y + col_h), radius=12, fill="#F8FAFC", outline="#E2E8F0", width=2)
draw.text((85, col_y + 16), "6 SPECIALIZED WORKFLOW MODULES", fill="#0F172A", font=font_bold)
draw_pill(65 + col_a_w - 145, col_y + 14, 125, 26, "#0F172A", "Life-Cycle Logic", "#FFFFFF", font_small)

modules = [
    ("📄  Documents", "Profile-driven ID & policy verification; approval / correction requests"),
    ("💻  Equipment", "Inventory catalog check, serial allocation, dispatch & employee receipt"),
    ("💳  Payroll Setup", "Employee entry -> HR review -> Sandbox config receipt -> Masked view"),
    ("🛡️  Benefits Enrolment", "Jurisdiction plan election -> HR approval -> Carrier sync receipt -> Active"),
    ("🎓  Compliance Training", "Structured lessons + assessment questions + 80% passing threshold"),
    ("🤝  Manager Readiness", "Peer buddy matching from active team + Day-1 agenda scheduling")
]

for idx, (m_title, m_desc) in enumerate(modules):
    my = col_y + 55 + idx * 52
    draw_rounded_rect((85, my, 65 + col_a_w - 20, my + 44), radius=8, fill="#FFFFFF", outline="#E2E8F0")
    draw.text((100, my + 6), m_title, fill="#1D4ED8", font=font_bold)
    draw.text((100, my + 24), m_desc, fill="#475569", font=font_small)

# Column B: Deterministic Guardrails Pipeline (THE SHIELD)
col_b_x = 65 + col_a_w + 30
col_b_w = 740
draw_rounded_rect((col_b_x, col_y, col_b_x + col_b_w, col_y + col_h), radius=12, fill="#F0FDF4", outline="#86EFAC", width=2)
draw.text((col_b_x + 20, col_y + 16), "8-STAGE DETERMINISTIC GUARDRAIL HARNESS", fill="#15803D", font=font_bold)
draw_pill(col_b_x + col_b_w - 175, col_y + 14, 155, 26, "#16A34A", "Zero-Hallucination", "#FFFFFF", font_small)

guardrails = [
    ("1. Zod Contract Validation", "Enforces strict schemas; rejects unapproved task vocabularies"),
    ("2. Citation Grounding Guard", "Validates that every proposed task maps to an active law/policy clause"),
    ("3. Jurisdiction Scope Check", "Enforces local rules for CA-ON, GB, IN-KA, SG; refuses unsupported"),
    ("4. Mandatory Coverage Enforcer", "Prevents bypass of essential compliance (tax, ID, safety training)"),
    ("5. Anti-Cycle Topological Sorter", "Detects & rejects circular dependencies in the task workflow DAG"),
    ("6. Authority Class Guards", "PAY_AFFECTING & LEGAL tasks locked; cannot be auto-completed"),
    ("7. Human Approval Gate", "HR Administrator must explicitly inspect and sign off on proposals"),
    ("8. State Machine & Audit Trail", "All state transitions logged with immutable actor ID and timestamp")
]

for idx, (g_title, g_desc) in enumerate(guardrails):
    gy = col_y + 50 + idx * 40
    draw_rounded_rect((col_b_x + 15, gy, col_b_x + col_b_w - 15, gy + 34), radius=6, fill="#FFFFFF", outline="#BBF7D0")
    draw.text((col_b_x + 25, gy + 4), g_title, fill="#166534", font=font_bold)
    draw.text((col_b_x + 265, gy + 5), "— " + g_desc, fill="#334155", font=font_small)

# Column C: AI Intelligence & Fallback Engine
col_c_x = col_b_x + col_b_w + 30
col_c_w = WIDTH - col_c_x - 65
draw_rounded_rect((col_c_x, col_y, col_c_x + col_c_w, col_y + col_h), radius=12, fill="#EFF6FF", outline="#93C5FD", width=2)
draw.text((col_c_x + 20, col_y + 16), "AI & REASONING LAYER", fill="#1D4ED8", font=font_bold)
draw_pill(col_c_x + col_c_w - 135, col_y + 14, 115, 26, "#2563EB", "Hybrid AI", "#FFFFFF", font_small)

draw_rounded_rect((col_c_x + 15, col_y + 55, col_c_x + col_c_w - 15, col_y + 140), radius=8, fill="#FFFFFF", outline="#BFDBFE")
draw.text((col_c_x + 25, col_y + 65), "🤖 LLM Proposal Engine", fill="#1E40AF", font=font_bold)
draw.text((col_c_x + 25, col_y + 90), "• Model: Gemini Flash / Ollama Qwen2.5", fill="#475569", font=font_small)
draw.text((col_c_x + 25, col_y + 112), "• Generates structured task DAG proposals", fill="#475569", font=font_small)

draw_rounded_rect((col_c_x + 15, col_y + 155, col_c_x + col_c_w - 15, col_y + 240), radius=8, fill="#FFFFFF", outline="#BFDBFE")
draw.text((col_c_x + 25, col_y + 165), "💬 RAG Policy Assistant", fill="#1E40AF", font=font_bold)
draw.text((col_c_x + 25, col_y + 190), "• Vector & clause retrieval across corpus", fill="#475569", font=font_small)
draw.text((col_c_x + 25, col_y + 212), "• Cites real verified clauses in answers", fill="#475569", font=font_small)

draw_rounded_rect((col_c_x + 15, col_y + 255, col_c_x + col_c_w - 15, col_y + 360), radius=8, fill="#FEF3C7", outline="#FCD34D")
draw.text((col_c_x + 25, col_y + 265), "⚡ Deterministic Fail-Safe Engine", fill="#B45309", font=font_bold)
draw.text((col_c_x + 25, col_y + 290), "• Active when LLM_PROVIDER=disabled", fill="#78350F", font=font_small)
draw.text((col_c_x + 25, col_y + 312), "• Generates 100% compliant baseline plans", fill="#78350F", font=font_small)
draw.text((col_c_x + 25, col_y + 334), "• Zero interruption during API timeouts", fill="#78350F", font=font_small)


# ==================== CONNECTING DB BUS ====================
y_db_bus = 995
draw_rounded_rect((40, y_db_bus, WIDTH - 40, y_db_bus + 40), radius=8, fill="#334155")
draw.text((WIDTH//2 - 250, y_db_bus + 10), "PRISMA ORM OBJECT-RELATIONAL MAPPING LAYER", fill="#FFFFFF", font=font_bold)


# ==================== TIER 3: DATA & PERSISTENCE ====================
y_tier3 = 1055
h_tier3 = 330
draw_rounded_rect((40, y_tier3, WIDTH - 40, y_tier3 + h_tier3), radius=18, fill="#FFFFFF", outline="#CBD5E1", width=2)
draw.text((65, y_tier3 + 18), "TIER 3: DATA, COMPLIANCE & PERSISTENCE LAYER (PostgreSQL 16 + Encrypted Storage)", fill="#0F172A", font=font_sec_title)

# 3 Storage Blocks
store_w = (WIDTH - 130 - 60) // 3
store_y = y_tier3 + 60
store_h = 240

# DB 1: Relational State
sx = 65
draw_rounded_rect((sx, store_y, sx + store_w, store_y + store_h), radius=12, fill="#F8FAFC", outline="#CBD5E1", width=2)
draw.text((sx + 20, store_y + 16), "🗄️ Relational PostgreSQL Database", fill="#0F172A", font=font_bold)
draw.text((sx + 20, store_y + 50), "• Employee Profiles & Employment Details", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 78), "• Onboarding Plans & Topological Graph", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 106), "• Task Dependency State Machine", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 134), "• Assessment Questions & Attempt History", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 162), "• Equipment Inventory & Serial Allocations", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 190), "• Benefit Enrollments & Carrier Receipts", fill="#334155", font=font_regular)

# DB 2: Policy Corpus
sx += store_w + 30
draw_rounded_rect((sx, store_y, sx + store_w, store_y + store_h), radius=12, fill="#F8FAFC", outline="#CBD5E1", width=2)
draw.text((sx + 20, store_y + 16), "📜 Statutory Policy Corpus", fill="#0F172A", font=font_bold)
draw.text((sx + 20, store_y + 50), "• CA-ON: Ontario OHS & ESA Regulations", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 78), "• GB: UK Data Protection & Pension Enrolment", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 106), "• IN-KA: Karnataka POSH Act & Gratuity Rules", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 134), "• SG: Singapore WSH Act & CPF Guidelines", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 162), "• Versioned Clauses with Text Fingerprints", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 190), "• Legal Authority Class & Deadline Offsets", fill="#334155", font=font_regular)

# DB 3: Security & Privacy Vault
sx += store_w + 30
draw_rounded_rect((sx, store_y, sx + store_w, store_y + store_h), radius=12, fill="#F8FAFC", outline="#CBD5E1", width=2)
draw.text((sx + 20, store_y + 16), "🔒 Security, Audit & Privacy Vault", fill="#0F172A", font=font_bold)
draw.text((sx + 20, store_y + 50), "• Immutable Audit Event Ledger", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 78), "• PII Masking: Last 4 digits only (No raw bank info)", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 106), "• Sandboxed Payroll & Benefit Configuration Receipts", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 134), "• Argon2 / BCrypt Password Hashing", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 162), "• Scoped Identity & OIDC Session Linking", fill="#334155", font=font_regular)
draw.text((sx + 20, store_y + 190), "• Local & Cloud Storage for Signed PDF Documents", fill="#334155", font=font_regular)

# Save image in project root
out_path1 = "CLYORA_Architecture_Diagram.png"
img.save(out_path1, "PNG", dpi=(300, 300))
print("Saved to", os.path.abspath(out_path1))

# Also save in brain artifact directory if possible
brain_dir = r"C:\Users\welcome\.gemini\antigravity\brain\dabc1726-c718-439f-ab3f-fc145380bfd7"
if os.path.exists(brain_dir):
    out_path2 = os.path.join(brain_dir, "CLYORA_Architecture_Diagram.png")
    img.save(out_path2, "PNG", dpi=(300, 300))
    print("Saved to", out_path2)

