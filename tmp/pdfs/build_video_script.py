from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    PageBreak,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
)


ROOT = Path(r"E:\Projects\EmployeeOnboarding\Employee-Onboarding")
OUTPUT = ROOT / "output" / "pdf" / "CLYORA_AI_Innovation_Challenge_10_Minute_Video_Script.pdf"
OUTPUT.parent.mkdir(parents=True, exist_ok=True)

NAVY = colors.HexColor("#102A43")
NAVY_2 = colors.HexColor("#183B5B")
BLUE = colors.HexColor("#2364F5")
TEAL = colors.HexColor("#11A8A5")
INK = colors.HexColor("#172B4D")
MUTED = colors.HexColor("#5B6F86")
PALE = colors.HexColor("#F2F7FD")
PALE_BLUE = colors.HexColor("#EAF2FF")
PALE_TEAL = colors.HexColor("#E7F8F6")
LINE = colors.HexColor("#D8E2EE")
WHITE = colors.white

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(
    name="CoverEyebrow", fontName="Helvetica-Bold", fontSize=9.5, leading=13,
    textColor=colors.HexColor("#86E1DD"), spaceAfter=12, tracking=1.4,
))
styles.add(ParagraphStyle(
    name="CoverTitle", fontName="Helvetica-Bold", fontSize=31, leading=36,
    textColor=WHITE, spaceAfter=10,
))
styles.add(ParagraphStyle(
    name="CoverSub", fontName="Helvetica", fontSize=14, leading=21,
    textColor=colors.HexColor("#D6E5F5"), spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="CoverMeta", fontName="Helvetica-Bold", fontSize=10, leading=14,
    textColor=WHITE,
))
styles.add(ParagraphStyle(
    name="Eyebrow", fontName="Helvetica-Bold", fontSize=8.5, leading=11,
    textColor=BLUE, spaceAfter=5, tracking=1.1,
))
styles.add(ParagraphStyle(
    name="PageTitle", fontName="Helvetica-Bold", fontSize=22, leading=27,
    textColor=NAVY, spaceAfter=5,
))
styles.add(ParagraphStyle(
    name="Deck", fontName="Helvetica", fontSize=10.2, leading=14.3,
    textColor=MUTED, spaceAfter=12,
))
styles.add(ParagraphStyle(
    name="SectionTitle", fontName="Helvetica-Bold", fontSize=13.2, leading=17,
    textColor=NAVY, spaceBefore=6, spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="BodyCustom", fontName="Helvetica", fontSize=9.6, leading=14.1,
    textColor=INK, spaceAfter=7,
))
styles.add(ParagraphStyle(
    name="SmallCustom", fontName="Helvetica", fontSize=8.4, leading=11.3,
    textColor=MUTED, spaceAfter=3,
))
styles.add(ParagraphStyle(
    name="TableHead", fontName="Helvetica-Bold", fontSize=8.1, leading=10.4,
    textColor=WHITE,
))
styles.add(ParagraphStyle(
    name="TableCell", fontName="Helvetica", fontSize=8.1, leading=10.8,
    textColor=INK,
))
styles.add(ParagraphStyle(
    name="TableCellBold", fontName="Helvetica-Bold", fontSize=8.1, leading=10.8,
    textColor=NAVY,
))
styles.add(ParagraphStyle(
    name="Cue", fontName="Helvetica", fontSize=8.6, leading=12.2,
    textColor=NAVY_2,
))
styles.add(ParagraphStyle(
    name="Narration", fontName="Helvetica", fontSize=9.7, leading=14.6,
    textColor=INK, spaceAfter=8,
))
styles.add(ParagraphStyle(
    name="Note", fontName="Helvetica", fontSize=8.3, leading=11.3,
    textColor=MUTED,
))
styles.add(ParagraphStyle(
    name="Callout", fontName="Helvetica-Bold", fontSize=9, leading=12.5,
    textColor=NAVY,
))
styles.add(ParagraphStyle(
    name="CenterSmall", fontName="Helvetica-Bold", fontSize=8.5, leading=11,
    textColor=NAVY, alignment=TA_CENTER,
))


def p(text, style="BodyCustom"):
    return Paragraph(escape(text).replace("\n", "<br/>"), styles[style])


def cell(text, bold=False):
    return p(text, "TableCellBold" if bold else "TableCell")


def draw_mark(canvas, x, y, size, fill=BLUE, text_color=WHITE):
    canvas.saveState()
    canvas.setFillColor(fill)
    canvas.circle(x + size / 2, y + size / 2, size / 2, fill=1, stroke=0)
    canvas.setFillColor(text_color)
    canvas.setFont("Helvetica-Bold", size * 0.62)
    canvas.drawCentredString(x + size / 2, y + size * 0.20, "C")
    canvas.restoreState()


def draw_cover(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(NAVY)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    canvas.setFillColor(NAVY_2)
    canvas.circle(width + 8, height - 80, 168, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#1A4869"))
    canvas.circle(width - 8, height - 84, 118, fill=1, stroke=0)
    draw_mark(canvas, 48, height - 91, 31, TEAL)
    canvas.setFillColor(colors.HexColor("#B5C8DB"))
    canvas.setFont("Helvetica", 8)
    canvas.drawString(86, height - 72, "CLYORA  |  INTELLIGENT EMPLOYEE ONBOARDING")
    canvas.setStrokeColor(colors.HexColor("#31536E"))
    canvas.setLineWidth(0.7)
    canvas.line(48, 43, width - 48, 43)
    canvas.setFillColor(colors.HexColor("#B5C8DB"))
    canvas.setFont("Helvetica", 8)
    canvas.drawString(48, 29, "AI INNOVATION CHALLENGE  |  PRESENTER SCRIPT")
    canvas.drawRightString(width - 48, 29, "10:00 TARGET")
    canvas.restoreState()


def draw_main(canvas, doc):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(WHITE)
    canvas.rect(0, 0, width, height, fill=1, stroke=0)
    draw_mark(canvas, 44, height - 34, 19, BLUE)
    canvas.setFillColor(NAVY)
    canvas.setFont("Helvetica-Bold", 8)
    canvas.drawString(70, height - 27, "CLYORA  /  AI INNOVATION CHALLENGE")
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 8)
    canvas.drawRightString(width - 44, height - 27, "10-MINUTE VIDEO GUIDE")
    canvas.setStrokeColor(LINE)
    canvas.setLineWidth(0.65)
    canvas.line(44, height - 42, width - 44, height - 42)
    canvas.line(44, 31, width - 44, 31)
    canvas.setFillColor(MUTED)
    canvas.setFont("Helvetica", 7.5)
    canvas.drawString(44, 19, "Prepared against the supplied university brief and current repository documentation")
    canvas.drawRightString(width - 44, 19, f"{doc.page}")
    canvas.restoreState()


def header(kicker, title, subtitle=None):
    result = [p(kicker.upper(), "Eyebrow"), p(title, "PageTitle")]
    if subtitle:
        result.append(p(subtitle, "Deck"))
    return result


def styled_table(data, widths, header_row=False, row_bgs=None, padd=6):
    t = Table(data, colWidths=widths, repeatRows=1 if header_row else 0, hAlign="LEFT")
    cmds = [
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("LEFTPADDING", (0, 0), (-1, -1), padd),
        ("RIGHTPADDING", (0, 0), (-1, -1), padd),
        ("TOPPADDING", (0, 0), (-1, -1), padd),
        ("BOTTOMPADDING", (0, 0), (-1, -1), padd),
        ("GRID", (0, 0), (-1, -1), 0.45, LINE),
    ]
    if header_row:
        cmds.extend([
            ("BACKGROUND", (0, 0), (-1, 0), NAVY),
            ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ])
    if row_bgs:
        for row, color in enumerate(row_bgs):
            cmds.append(("BACKGROUND", (0, row), (-1, row), color))
    t.setStyle(TableStyle(cmds))
    return t


def cue_box(text, bg=PALE_BLUE):
    box = Table([[p(text, "Cue")]], colWidths=[164 * mm], hAlign="LEFT")
    box.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("LINEBEFORE", (0, 0), (0, -1), 3, BLUE if bg == PALE_BLUE else TEAL),
        ("LEFTPADDING", (0, 0), (-1, -1), 9),
        ("RIGHTPADDING", (0, 0), (-1, -1), 9),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    return box


def slide_header(number, timebox, title, purpose):
    label = Table([[
        p(f"SLIDE {number}  |  {timebox}", "Eyebrow"),
        p("TARGET TIME", "Note"),
    ]], colWidths=[112 * mm, 52 * mm])
    label.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), PALE),
        ("BOX", (0, 0), (-1, -1), 0.6, LINE),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (1, 0), (1, 0), "RIGHT"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
    ]))
    return [label, Spacer(1, 7), p(title, "PageTitle"), p(purpose, "Deck")]


def narration_block(paragraphs):
    blocks = [p("SAY", "Eyebrow")]
    blocks.extend(p(text, "Narration") for text in paragraphs)
    return blocks


story = []

# Cover
story.extend([
    Spacer(1, 55 * mm),
    p("10-MINUTE VIDEO PRESENTATION", "CoverEyebrow"),
    p("CLYORA", "CoverTitle"),
    p("AI-assisted employee onboarding,\nfrom fragmented handoffs to one governed journey.", "CoverSub"),
    Spacer(1, 8 * mm),
    Table([[p("PRESENTER SCRIPT", "CoverMeta"), p("5-SLIDE STORY", "CoverMeta"), p("LIVE DEMO CUES", "CoverMeta")]], colWidths=[49 * mm, 48 * mm, 49 * mm], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), colors.HexColor("#1B4668")),
        ("BOX", (0, 0), (-1, -1), 0.7, colors.HexColor("#426683")),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
    ])),
    Spacer(1, 11 * mm),
    p("Built for the university challenge recording: one clear user problem, a real end-to-end workflow, the AI harness, safety and evidence, then honest next steps.", "CoverSub"),
    Spacer(1, 34 * mm),
    p("Timing includes short screen transitions. Read at a conversational pace; text in the blue cue panels is an instruction for the presenter, not narration.", "CoverMeta"),
    PageBreak(),
])

# Brief mapping and run of show
story.extend(header(
    "Start here",
    "The brief, translated into a 10-minute story",
    "The supplied challenge brief asks for a useful AI product feature inside a governed engineering harness. It explicitly requires a 10-minute recording and a five-slide story.",
))
story.append(p("Run of show", "SectionTitle"))
timeline = [[cell("TIME", True), cell("SLIDE", True), cell("WHAT THE REVIEWER SHOULD SEE", True)]]
for row in [
    ("00:00-01:10", "1. Problem and value", "Who is stuck, why the handoffs matter, and what CLYORA changes."),
    ("01:10-04:20", "2. Product workflow and demo", "HR creates and approves a plan; employee and manager do their work; payroll has an explicit review gate."),
    ("04:20-06:15", "3. Architecture and harness", "How trusted context, model proposals, deterministic checks and persistence fit together."),
    ("06:15-08:20", "4. Safety and evidence", "Security boundaries, human decisions, validation, testing evidence and known limits."),
    ("08:20-10:00", "5. Impact and next steps", "Expected value, how it will be measured and what must be connected next."),
]:
    timeline.append([cell(row[0], True), cell(row[1], True), cell(row[2])])
story.append(styled_table(timeline, [29 * mm, 42 * mm, 93 * mm], header_row=True, padd=5))
story.append(Spacer(1, 8))
story.append(p("Challenge scoring to cover", "SectionTitle"))
rubric = [[cell("CATEGORY", True), cell("WEIGHT", True), cell("EVIDENCE TO SAY OR SHOW", True)]]
for row in [
    ("Product value", "25%", "A concrete onboarding problem and a coherent workflow."),
    ("Harness engineering", "25%", "Contracts, validation, guardrails, fallback and human oversight."),
    ("LLM implementation", "20%", "Grounding, retrieval, citation integrity and useful refusal behavior."),
    ("Engineering quality", "15%", "API/data design, checks, observability and clear documentation."),
    ("Demo recording", "15%", "A legible end-to-end walkthrough with technical explanation."),
]:
    rubric.append([cell(row[0], True), cell(row[1], True), cell(row[2])])
story.append(styled_table(rubric, [42 * mm, 20 * mm, 102 * mm], header_row=True, padd=5))
story.append(Spacer(1, 8))
story.append(cue_box("Recording rule: do not invent an ROI number, model accuracy score, or production integration. The script names expected impact and separates it from measured results."))
story.append(PageBreak())

# Slide 1
story.extend(slide_header("1", "00:00-01:10", "Problem and user value", "Slide goal: make the coordination problem understandable before naming implementation details."))
story.append(cue_box("ON SCREEN: Open on the CLYORA workspace or a clean title slide. Keep the screen uncluttered; point to HR, manager, IT, payroll, benefits, training and employee as the handoff chain."))
story.append(Spacer(1, 9))
story.extend(narration_block([
    "Hello, and thank you. We are presenting CLYORA, an AI-assisted employee onboarding orchestrator. The problem is coordination: a new hire depends on HR for records, a manager for team readiness, IT for equipment and access, and payroll, benefits, and training for service-specific steps. Those handoffs often sit in separate checklists and messages. A missed owner or prerequisite can make a new employee wait on day one.",
    "CLYORA gives the journey one plan with an owner, due date, dependency, and status for each task. HR gets organization-wide readiness; the manager sees team actions; the employee sees personal work and progress. The goal is fewer missed handoffs and a clearer first day. We have not measured that improvement yet, so I will show the workflow and the controls instead of claiming a savings number.",
    "Our design follows the challenge's employee onboarding use case: coordinate work from the employee's profile and location, while keeping important decisions with people. I will walk through one prepared example and show where AI helps, and where it must stop.",
]))
story.append(Spacer(1, 3))
story.append(cue_box("SLIDE CONTENT: One new hire, several teams, one accountable journey. Value proposition: clearer ownership, fewer missed handoffs, visible day-one readiness.", PALE_TEAL))
story.append(PageBreak())

# Slide 2
story.extend(slide_header("2", "01:10-04:20", "Product workflow and live demo", "Slide goal: show the same employee journey from HR, employee, manager and payroll-review perspectives."))
story.append(cue_box("DEMO ORDER: HR employee record -> generated plan and findings -> HR approval -> employee service work -> manager tasks -> payroll HR verification -> plan progress/audit. Use a prepared example; do not type real personal or bank details."))
story.append(Spacer(1, 8))
story.extend(narration_block([
    "I will start in the HR workspace. We create or open a prepared new-hire record and confirm the department, role, location, start date, and manager. Location matters because some obligations and deadlines depend on jurisdiction. From this profile, HR asks CLYORA to prepare an onboarding plan.",
    "The plan is a proposal, not an automatic instruction. The model can help select and organize work, while templates and deterministic rules preserve the required task types, owners, services, dates, and prerequisites. I can review the task list, policy citations, validation findings, and dependencies. Tasks with legal or pay impact are marked for review. HR acknowledges the plan and approves it before downstream work is dispatched. That approval is the first human control point.",
    "Next I switch to the employee workspace. The employee sees their own journey and can follow what is due, blocked, or complete. The service screens guide document submission, equipment receipt, benefits, training, and payroll setup instead of asking the employee to find instructions in email. For payroll, the employee enters pay frequency, currency, tax form type, and bank details in the protected form. I use example values only. The API does not retain the full bank number; it retains only the last four digits for verification.",
    "The employee cannot verify their own payroll setup. I switch back to the authorized HR administrator, review the submitted setup, and explicitly confirm it. Once verified, the payroll fields are locked. This keeps employee input separate from approval and leaves an audit trail.",
    "Finally, in the manager workspace, we see the manager-owned actions: assign a buddy, prepare the first-day agenda, review requested access, schedule introductions, and set probation goals. The work queue shows one employee's latest active plan at a time, so an older plan does not flood the view with duplicate tasks. I finish by showing status and audit history: who owns the next action, what is blocked, and what has been completed.",
]))
story.append(Spacer(1, 2))
story.append(cue_box("LIVE DEMO SAFETY: Use synthetic or redacted records on screen. Avoid showing personal email, identity documents, passwords, bank account numbers, OIDC secrets, or admin credentials.", PALE_TEAL))
story.append(PageBreak())

# Slide 3
story.extend(slide_header("3", "04:20-06:15", "Architecture and AI harness", "Slide goal: explain why the system is more than a prompt wrapped around a database."))
story.append(cue_box("ON SCREEN: Show this sequence, then open the plan findings/dependency view or a simple architecture slide."))
pipeline = [[
    p("PROFILE\nlocation", "CenterSmall"),
    p(">", "CenterSmall"),
    p("POLICY\nretrieval", "CenterSmall"),
    p(">", "CenterSmall"),
    p("MODEL\nproposal", "CenterSmall"),
    p(">", "CenterSmall"),
    p("VALIDATORS\nV1-V8", "CenterSmall"),
    p(">", "CenterSmall"),
    p("HR\napproval", "CenterSmall"),
    p(">", "CenterSmall"),
    p("TASKS\naudit", "CenterSmall"),
]]
pipeline_table = Table(pipeline, colWidths=[21 * mm, 5 * mm, 21 * mm, 5 * mm, 21 * mm, 5 * mm, 21 * mm, 5 * mm, 21 * mm, 5 * mm, 21 * mm], hAlign="LEFT")
pipeline_table.setStyle(TableStyle([
    ("BACKGROUND", (0, 0), (0, 0), PALE_BLUE),
    ("BACKGROUND", (2, 0), (2, 0), PALE_TEAL),
    ("BACKGROUND", (4, 0), (4, 0), PALE_BLUE),
    ("BACKGROUND", (6, 0), (6, 0), colors.HexColor("#FFF5E8")),
    ("BACKGROUND", (8, 0), (8, 0), PALE_TEAL),
    ("BACKGROUND", (10, 0), (10, 0), PALE_BLUE),
    ("BOX", (0, 0), (0, 0), 0.5, LINE),
    ("BOX", (2, 0), (2, 0), 0.5, LINE),
    ("BOX", (4, 0), (4, 0), 0.5, LINE),
    ("BOX", (6, 0), (6, 0), 0.5, LINE),
    ("BOX", (8, 0), (8, 0), 0.5, LINE),
    ("BOX", (10, 0), (10, 0), 0.5, LINE),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("TOPPADDING", (0, 0), (-1, -1), 8),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
    ("LEFTPADDING", (0, 0), (-1, -1), 2),
    ("RIGHTPADDING", (0, 0), (-1, -1), 2),
]))
story.append(pipeline_table)
story.append(Spacer(1, 10))
story.extend(narration_block([
    "The frontend is React and TypeScript. It calls a TypeScript API with shared, typed contracts; the backend uses Express, Prisma, and PostgreSQL. Zod schemas validate requests and generated proposals, and the API contract is published as OpenAPI.",
    "For a plan, the system processes the worker profile, retrieves approved policy clauses and templates, and may ask the configured model for a structured proposal. The proposal passes an eight-part validation chain: schema shape, citation integrity, jurisdiction scope, mandatory coverage, dependency graph integrity, recomputed deadlines, authority guards, and a closed task vocabulary. The task generator merges authoritative rules, checks the dependency graph for cycles, calculates task ordering and critical path, and saves findings with the plan.",
    "The provider adapter supports configured Ollama or Gemini use, with a deterministic operational baseline when model generation is unavailable. The baseline is not a substitute for legal policy: jurisdiction-specific legal, payroll, and compliance tasks must come from approved stored sources. The model can suggest; the server validates; HR approves; service workflows record the work.",
]))
story.append(PageBreak())

# Slide 4
story.extend(slide_header("4", "06:15-08:20", "Safety, testing and evaluation evidence", "Slide goal: show concrete controls, report verification accurately, and name what remains unverified."))
story.append(cue_box("ON SCREEN: Show plan findings/citations, a pending approval gate, payroll review state, or the audit history. Do not expose secrets or employee private data."))
story.append(Spacer(1, 8))
story.extend(narration_block([
    "The challenge asks us to make AI output safe, traceable, testable, and subject to human oversight. CLYORA grounds plan tasks in stored policy clauses. A citation must point to a real clause and quote its text. Jurisdiction mismatch, missing mandatory coverage, invalid task types, unsafe authority, or a cyclic dependency can be rejected or flagged instead of silently accepted. The plan records validation findings so a reviewer can see what was repaired, inserted, or refused.",
    "Identity and permission are separate from model output. Keycloak handles organization sign-in. Application roles and data scopes come from the database: HR can work across the organization, a manager is limited to their reports, and an employee is limited to their own record. The model cannot assign roles or grant access. Sensitive service actions use separate permission checks. Payroll is employee-submitted, HR-verified, and audited; the full bank number is not retained.",
    "The project verification notes record a local suite of 16 logic and artifact tests and selected database integration checks for sign-in, plan generation, dependencies, approvals, and document boundaries. For this preparation, the production build and lint checks also pass. We are not claiming that every role and screen has exhaustive end-to-end coverage: the project notes identify gaps. Live model inference and public Docker deployment were not verified, and supplied policy examples still need organization review before real compliance use.",
    "We also have not measured onboarding time saved or a model accuracy score. Instead, the system exposes reviewable signals: citations, validation findings, task state, and audit history. That is the evidence we can responsibly show today.",
]))
story.append(Spacer(1, 4))
story.append(cue_box("EVIDENCE TO SHOW: one valid citation, one dependency, one human approval state, one role-limited screen, and a persisted audit event. Do not present a test count as a current run unless you rerun that suite.", PALE_TEAL))
story.append(PageBreak())

# Slide 5
story.extend(slide_header("5", "08:20-10:00", "Expected impact and next steps", "Slide goal: finish with measurable outcomes and a credible path from prototype to deployment."))
story.append(cue_box("ON SCREEN: Return to the plan progress summary, then show a short impact/roadmap slide. Leave 10 seconds for the close."))
story.append(Spacer(1, 8))
story.extend(narration_block([
    "The expected business impact is a more predictable start for each employee: fewer missed handoffs, earlier visibility of blockers, and clearer accountability across HR, managers, IT, and the employee. Those outcomes are hypotheses until measured. In a pilot, I would track time from employee creation to approved plan, tasks completed by the start date, overdue and blocked tasks, corrections made by HR, and employee and manager feedback. We should compare against a baseline before claiming improvement.",
    "The next steps are practical. First, replace demonstration policy material with reviewed company policies for each supported jurisdiction and build a repeatable evaluation set for grounded plans and refusals. Second, add verified email notifications and connect real HRIS, identity, equipment, and payroll providers where the organization is ready. Third, move background jobs and documents to durable production infrastructure, then expand role-by-role end-to-end security testing and deployment verification.",
    "CLYORA's central design principle is simple: AI helps coordinate work, deterministic controls constrain it, and people remain accountable for important decisions. That gives us a useful prototype and a clear way to improve it safely. Thank you.",
]))
story.append(Spacer(1, 5))
story.append(p("Close on screen", "SectionTitle"))
story.append(cue_box("AI coordinates. Rules constrain. People decide.\nEnd the recording at 10:00; do not add an unplanned second demo."))
story.append(PageBreak())

# Recording appendix
story.extend(header(
    "Appendix / recording prep",
    "Demo runbook and accurate claims",
    "Use this page while preparing the browser and recording. It is intentionally operational rather than part of the spoken script.",
))
story.append(p("Before you press Record", "SectionTitle"))
checks = [
    "Confirm PostgreSQL is reachable, the API can load the signed-in user, and the frontend is pointed at the intended API.",
    "Start Keycloak and confirm the three pre-provisioned roles can sign in. Use separate browser profiles or windows so switching roles does not consume the recording.",
    "Prepare one synthetic employee with a department, location, start date, manager, and an active onboarding plan. Confirm the plan and payroll task load before recording.",
    "Use the saved plan for the screen walkthrough if live generation could take too long. If asked, explain that model proposals are validated and the deterministic baseline is the fallback.",
    "Keep real email addresses, passwords, OIDC secrets, identity documents, and bank numbers out of the recording. Use clearly synthetic data.",
    "Set browser zoom so task titles and status are readable. Close unrelated tabs and clear any personal data from the screen.",
    "Check the video clock at 4:20, 6:15, and 8:20. If behind, shorten screen transitions, not the safety and limitations section.",
]
for item in checks:
    story.append(p("- " + item, "BodyCustom"))
story.append(p("Claims to keep precise", "SectionTitle"))
claims = [
    ("AI and orchestration", "Say that the model proposes structured tasks. Rules, stored templates, the validator chain, and HR approval govern what is saved and dispatched."),
    ("Policy assistant", "It searches approved stored sources and cites them. It is not a general HR authority and should refuse unsupported questions."),
    ("Payroll", "This prototype captures onboarding payroll details and approval state. It is not connected to a payroll processor; only the last four bank digits are retained."),
    ("Email and provisioning", "Employee activation depends on Keycloak admin-client and SMTP configuration. Do not claim successful delivery unless you tested it in this environment."),
    ("Impact", "Describe expected benefits and proposed measures. No business outcome or accuracy percentage has been measured."),
    ("Deployment", "The repository documents a container path, but public deployment and Docker runtime were not verified in the project notes."),
]
claim_table = [[cell("TOPIC", True), cell("SAFE WORDING", True)]]
claim_table += [[cell(a, True), cell(b)] for a, b in claims]
story.append(styled_table(claim_table, [34 * mm, 130 * mm], header_row=True, padd=5))
story.append(Spacer(1, 8))
story.append(p("Local run reminder", "SectionTitle"))
story.append(cue_box("From the repository folder: npm run auth:up (if Keycloak is managed by the project's local Compose profile), then start the API with npm run dev:api and the web app with npm run dev:web in separate terminals. Open http://localhost:5173. If you use Neon instead of local PostgreSQL, make sure the Neon database is online and both database URLs in .env are correct.", PALE_TEAL))
story.append(Spacer(1, 9))
doc = SimpleDocTemplate(
    str(OUTPUT),
    pagesize=A4,
    rightMargin=22 * mm,
    leftMargin=22 * mm,
    topMargin=19 * mm,
    bottomMargin=17 * mm,
    title="CLYORA AI Innovation Challenge - 10 Minute Video Presentation Script",
    author="CLYORA Project Team",
    subject="Timed five-slide narration and demo runbook",
)
doc.build(story, onFirstPage=draw_cover, onLaterPages=draw_main)
print(OUTPUT)
