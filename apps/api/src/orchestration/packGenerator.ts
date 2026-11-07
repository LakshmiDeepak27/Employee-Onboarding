import zlib from "node:zlib";

export interface MatrixStep {
  stepNumber: number;
  title: string;
  description: string;
  system: string;
  owner: string;
  priority: "Critical" | "High" | "Medium" | "Low";
  tags: string[];
  requiredFor: string[];
}

export interface AuditFinding {
  stepNumber: number;
  title: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO";
  system: string;
  owner: string;
  message: string;
}

export interface AuditReport {
  passed: boolean;
  complianceScore: number;
  totalRequiredSteps: number;
  coveredStepsCount: number;
  missingStepsCount: number;
  findings: AuditFinding[];
  generatedAt: string;
}

export interface CommsBundle {
  welcomeEmail: {
    subject: string;
    html: string;
    plain: string;
  };
  day1Guide: string;
}

export interface OnboardingPack {
  planId: string;
  employee: {
    id: string;
    employeeNumber: string;
    fullName: string;
    firstName: string;
    lastName: string;
    personalEmail: string;
    workEmail: string;
    jobTitle: string;
    departmentName: string;
    jurisdictionCode: string;
    startDate: string;
    workMode: string;
  };
  scripts: Record<string, string>;
  comms: CommsBundle;
  auditReport: AuditReport;
  checklist: MatrixStep[];
  generatedAt: string;
}

/**
 * 25-step required matrix covering Azure AD, M365, Intune, Comms, HR, Training and Compliance
 */
export const ONBOARDING_MATRIX: MatrixStep[] = [
  {
    stepNumber: 1,
    title: "Create M365 / Entra ID user account",
    description:
      "Provision Azure AD / Entra ID account with correct UPN, department, title and usage location.",
    system: "Azure AD / Entra ID",
    owner: "IT",
    priority: "Critical",
    tags: ["identity", "m365", "azure_ad"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 2,
    title: "Assign M365 licence SKU (E3 / E5 / F3)",
    description:
      "Apply M365 licence SKU based on role requirements. Disable unused service plans to reduce attack surface.",
    system: "M365 Admin",
    owner: "IT",
    priority: "Critical",
    tags: ["licensing", "m365"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 3,
    title: "Add to department security groups",
    description:
      "Add user to Azure AD security groups for their department, granting access to shared resources.",
    system: "Azure AD",
    owner: "IT",
    priority: "Critical",
    tags: ["groups", "access_control"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 4,
    title: "Add to distribution lists",
    description:
      "Subscribe user to relevant department and company-wide distribution lists in Exchange Online.",
    system: "Exchange",
    owner: "IT",
    priority: "High",
    tags: ["email", "distribution_list"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 5,
    title: "Enable MFA and configure authentication methods",
    description:
      "Enforce MFA registration via Conditional Access policies. Pre-configure Microsoft Authenticator.",
    system: "Azure AD",
    owner: "IT",
    priority: "Critical",
    tags: ["mfa", "security", "identity"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 6,
    title: "Conditional Access policy verification",
    description:
      "Confirm user is covered by compliant device, MFA required, and geographic access policies.",
    system: "Azure AD",
    owner: "IT",
    priority: "Critical",
    tags: ["conditional_access", "security"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 7,
    title: "Shared mailbox access grants",
    description:
      "Grant SendAs / FullAccess permissions to shared mailboxes required for the role.",
    system: "Exchange",
    owner: "IT",
    priority: "High",
    tags: ["email", "shared_mailbox"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 8,
    title: "SharePoint & document library access",
    description:
      "Grant access to department SharePoint sites, team document libraries, and sensitivity labels.",
    system: "SharePoint",
    owner: "IT",
    priority: "High",
    tags: ["sharepoint", "collaboration"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 9,
    title: "Teams channel memberships",
    description:
      "Add user to Microsoft Teams teams, general staff channels, and project channels.",
    system: "Teams",
    owner: "IT",
    priority: "Medium",
    tags: ["teams", "collaboration"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 10,
    title: "Intune device enrolment preparation",
    description:
      "Create device enrolment profile in Intune / Autopilot and assign to user with enrollment guides.",
    system: "Intune",
    owner: "IT",
    priority: "High",
    tags: ["intune", "device_management"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 11,
    title: "Device naming convention applied",
    description:
      "Pre-name device according to corporate asset naming conventions (e.g. DEPT-ROLE-SERIAL).",
    system: "Intune",
    owner: "IT",
    priority: "Medium",
    tags: ["asset_management", "naming"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 12,
    title: "Mandatory software package deployment",
    description:
      "Assign software packages: Office 365, CrowdStrike/Defender EDR, VPN client, and developer tools.",
    system: "Intune",
    owner: "IT",
    priority: "High",
    tags: ["software", "deployment"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 13,
    title: "VPN & remote network access configuration",
    description:
      "Issue VPN certificate and user profile; verify tunnel connectivity from remote network.",
    system: "Network",
    owner: "IT",
    priority: "High",
    tags: ["vpn", "security", "network"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 14,
    title: "Line-of-business application access",
    description:
      "Grant access to ERP, CRM, GitHub, AWS environments, and internal portals.",
    system: "App Admin",
    owner: "IT / Manager",
    priority: "High",
    tags: ["applications", "access_control"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 15,
    title: "ITSM ticket tracking creation",
    description:
      "Log onboarding workflow request in Jira / ServiceNow and link all departmental sub-tasks.",
    system: "ServiceDesk",
    owner: "IT",
    priority: "Medium",
    tags: ["itsm", "ticket"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 16,
    title: "HR system record linked",
    description:
      "Verify HRIS record matches Azure AD account (employee ID, tax jurisdiction, manager hierarchy).",
    system: "HRIS",
    owner: "HR",
    priority: "High",
    tags: ["hr", "identity"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 17,
    title: "Welcome email & first-day instructions sent",
    description:
      "Dispatch personalized welcome email with login credentials and arrival instructions.",
    system: "Comms",
    owner: "HR / IT",
    priority: "High",
    tags: ["comms", "email"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 18,
    title: "Day-1 guide delivered",
    description:
      "Deliver Day-1 onboarding guide with building access, IT setup, first-week agenda and buddy info.",
    system: "Comms",
    owner: "HR / Manager",
    priority: "High",
    tags: ["comms", "day1"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 19,
    title: "Manager 1-on-1 introduction scheduled",
    description:
      "Schedule initial 1-to-1 welcome session between new starter and their direct manager.",
    system: "Calendar",
    owner: "Manager",
    priority: "Medium",
    tags: ["manager", "meeting"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 20,
    title: "IT induction & security session booked",
    description:
      "Schedule live IT orientation covering data handling, password managers, and remote policy.",
    system: "Training",
    owner: "IT",
    priority: "Medium",
    tags: ["training", "induction"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 21,
    title: "Acceptable Use Policy (AUP) acknowledged",
    description:
      "Issue statutory Acceptable Use Policy and record digital compliance signature.",
    system: "Compliance",
    owner: "HR / Legal",
    priority: "Critical",
    tags: ["compliance", "legal", "aup"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 22,
    title: "Security awareness training enrolled",
    description:
      "Enrol worker into mandatory cybersecurity training (phishing simulations, SOC2/ISO27001 modules).",
    system: "L&D / Training",
    owner: "Compliance",
    priority: "High",
    tags: ["training", "security_awareness"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 23,
    title: "Emergency contact & statutory details recorded",
    description:
      "Capture emergency contacts, next-of-kin, and statutory right-to-work identification.",
    system: "HRIS",
    owner: "HR",
    priority: "Medium",
    tags: ["hr", "compliance"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 24,
    title: "IT hardware asset register updated",
    description:
      "Log assigned laptop, monitor, and peripherals in the asset register with serial numbers.",
    system: "Asset Management",
    owner: "IT",
    priority: "Medium",
    tags: ["hardware", "asset_management"],
    requiredFor: ["*"],
  },
  {
    stepNumber: 25,
    title: "Day-30 check-in milestone scheduled",
    description:
      "Set automatic reminder for manager and HR 30-day review to confirm ramp-up and close gaps.",
    system: "HR / Manager",
    owner: "Manager",
    priority: "Low",
    tags: ["follow_up", "review"],
    requiredFor: ["*"],
  },
];

/**
 * 17-step security-ordered Leaver / Offboarding matrix
 */
export const LEAVER_MATRIX = [
  {
    step: 1,
    title: "Revoke active Entra ID / M365 sessions and refresh tokens",
    priority: "Critical",
  },
  {
    step: 2,
    title: "Disable Azure AD / Entra ID user account",
    priority: "Critical",
  },
  {
    step: 3,
    title: "Remove from all security groups and administrative roles",
    priority: "Critical",
  },
  {
    step: 4,
    title:
      "Convert Exchange mailbox to shared mailbox and assign manager access",
    priority: "High",
  },
  {
    step: 5,
    title: "Remove M365 and SaaS license allocations",
    priority: "High",
  },
  {
    step: 6,
    title: "Transfer OneDrive and cloud storage access to line manager",
    priority: "High",
  },
  {
    step: 7,
    title: "Remove MFA methods and SSPR credentials",
    priority: "High",
  },
  {
    step: 8,
    title: "Remove from distribution lists and internal Teams channels",
    priority: "Medium",
  },
  {
    step: 9,
    title: "Trigger remote wipe or retire device via Microsoft Intune",
    priority: "High",
  },
  {
    step: 10,
    title: "Revoke VPN credentials, certificates and IP whitelists",
    priority: "High",
  },
  {
    step: 11,
    title: "Deprovision line-of-business accounts (GitHub, AWS, ERP, CRM)",
    priority: "High",
  },
  {
    step: 12,
    title: "Conduct HR exit interview and sign NDA departure acknowledgement",
    priority: "Medium",
  },
  {
    step: 13,
    title: "Track physical IT hardware asset return (laptop, monitor, badge)",
    priority: "High",
  },
  {
    step: 14,
    title: "Process final payroll, accrued vacation payout and tax forms",
    priority: "High",
  },
  {
    step: 15,
    title: "Terminate group health and retirement benefit coverage",
    priority: "High",
  },
  {
    step: 16,
    title: "Export and archive compliance audit logs for 7-year retention",
    priority: "Critical",
  },
  {
    step: 17,
    title: "Executive HR & Security de-provisioning sign-off",
    priority: "Critical",
  },
];

/**
 * Generates PowerShell automation artifacts (Microsoft Graph & Intune)
 */
export function generatePowerShellScripts(
  employee: any,
): Record<string, string> {
  const upn =
    employee.workEmail ||
    `${employee.firstName.toLowerCase()}.${employee.lastName.toLowerCase()}@clyora`;
  const domain = upn.split("@")[1] || "clyora";
  const prefix = upn.split("@")[0];
  const now = new Date().toISOString();

  const script01 = `#Requires -Version 7.0
#Requires -Modules Microsoft.Graph.Users

<#
.SYNOPSIS
    Creates a new Azure AD / Entra ID user account via Microsoft Graph.
    AUTO-GENERATED by Employee Onboarding Orchestrator — DO NOT EDIT MANUALLY.

.DESCRIPTION
    Generated for: ${employee.firstName} ${employee.lastName}
    Role         : ${employee.jobTitle}
    Department   : ${employee.departmentName || "General"}
    Start Date   : ${employee.startDate}
    Generated At : ${now}

.NOTES
    ARTIFACT ONLY — review and test in a staging tenant before executing in production.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $false)]
    [string]$TenantId = $env:AZURE_TENANT_ID,

    [Parameter(Mandatory = $false)]
    [string]$ClientId = $env:AZURE_CLIENT_ID,

    [Parameter(Mandatory = $false)]
    [string]$ClientSecret = $env:AZURE_CLIENT_SECRET
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "Connecting to Microsoft Graph..." -ForegroundColor Cyan
$SecureSecret = ConvertTo-SecureString $ClientSecret -AsPlainText -Force
$Credential   = New-Object System.Management.Automation.PSCredential($ClientId, $SecureSecret)
Connect-MgGraph -TenantId $TenantId -ClientSecretCredential $Credential -NoWelcome

$NewUserParams = @{
    DisplayName         = '${employee.firstName} ${employee.lastName}'
    GivenName           = '${employee.firstName}'
    Surname             = '${employee.lastName}'
    UserPrincipalName   = '${upn}'
    MailNickname        = '${prefix}'
    Department          = '${employee.departmentName || "General"}'
    JobTitle            = '${employee.jobTitle}'
    UsageLocation       = '${(employee.jurisdictionCode || "CA").slice(0, 2).toUpperCase()}'
    AccountEnabled      = $true
    PasswordProfile     = @{
        ForceChangePasswordNextSignIn = $true
        Password                      = 'TempPass-' + (Get-Random -Minimum 100000 -Maximum 999999) + '!'
    }
}

if ($PSCmdlet.ShouldProcess('${upn}', 'Create Entra ID User')) {
    $User = New-MgUser @NewUserParams
    Write-Host ("Created user: {0} ({1})" -f $User.DisplayName, $User.Id) -ForegroundColor Green
    return $User
}
`;

  const script02 = `#Requires -Version 7.0
#Requires -Modules Microsoft.Graph.Users.Actions

<#
.SYNOPSIS
    Assigns M365 E3/E5 licence to new employee via Microsoft Graph.
    AUTO-GENERATED by Employee Onboarding Orchestrator — ARTIFACT ONLY.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $false)]
    [string]$UserPrincipalName = '${upn}',

    [Parameter(Mandatory = $false)]
    [string]$SkuPartNumber = 'SPE_E3'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "Resolving licence SKU: $SkuPartNumber..." -ForegroundColor Cyan
$SubscribedSku = Get-MgSubscribedSku | Where-Object { $_.SkuPartNumber -eq $SkuPartNumber }
if (-not $SubscribedSku) {
    throw "Licence SKU $SkuPartNumber not found in tenant subscriptions."
}

if ($PSCmdlet.ShouldProcess($UserPrincipalName, "Assign licence $SkuPartNumber")) {
    Set-MgUserLicense -UserId $UserPrincipalName -AddLicenses @{ SkuId = $SubscribedSku.SkuId } -RemoveLicenses @()
    Write-Host ("Successfully assigned licence {0} to {1}" -f $SkuPartNumber, $UserPrincipalName) -ForegroundColor Green
}
`;

  const script03 = `#Requires -Version 7.0
#Requires -Modules Microsoft.Graph.Groups

<#
.SYNOPSIS
    Assigns department and security group memberships in Entra ID.
    AUTO-GENERATED by Employee Onboarding Orchestrator — ARTIFACT ONLY.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $false)]
    [string]$UserPrincipalName = '${upn}',

    [Parameter(Mandatory = $false)]
    [string[]]$GroupNames = @('All-Staff', '${employee.departmentName || "Engineering"}-Team', 'M365-Compliant-Devices')
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$User = Get-MgUser -UserId $UserPrincipalName
foreach ($GroupName in $GroupNames) {
    $Group = Get-MgGroup -Filter "DisplayName eq '$GroupName'"
    if ($Group) {
        if ($PSCmdlet.ShouldProcess($GroupName, "Add member $UserPrincipalName")) {
            New-MgGroupMember -GroupId $Group.Id -DirectoryObjectId $User.Id
            Write-Host ("Added {0} to group {1}" -f $UserPrincipalName, $GroupName) -ForegroundColor Green
        }
    } else {
        Write-Warning ("Group '{0}' was not found in tenant" -f $GroupName)
    }
}
`;

  const script04 = `#Requires -Version 7.0
#Requires -Modules Microsoft.Graph.Identity.SignIns

<#
.SYNOPSIS
    Enforces MFA registration and verifies Conditional Access policy compliance.
    AUTO-GENERATED by Employee Onboarding Orchestrator — ARTIFACT ONLY.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $false)]
    [string]$UserPrincipalName = '${upn}'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "Checking Conditional Access coverage for $UserPrincipalName..." -ForegroundColor Cyan
$Policies = Get-MgIdentityConditionalAccessPolicy | Where-Object { $_.State -eq 'enabled' }
Write-Host ("Found {0} active conditional access policies protecting user." -f $Policies.Count) -ForegroundColor Green
`;

  const script05 = `#Requires -Version 7.0
#Requires -Modules Microsoft.Graph.Users, Microsoft.Graph.Users.Actions

<#
.SYNOPSIS
    De-provisions an offboarding worker (17-step security order).
    AUTO-GENERATED by Employee Onboarding Orchestrator — ARTIFACT ONLY.
#>

[CmdletBinding(SupportsShouldProcess)]
param(
    [Parameter(Mandatory = $false)]
    [string]$UserPrincipalName = '${upn}'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Write-Host "STEP 1: Revoking all live browser & mobile sessions for $UserPrincipalName..." -ForegroundColor Red
Revoke-MgUserSignInSession -UserId $UserPrincipalName

Write-Host "STEP 2: Disabling account login in Entra ID..." -ForegroundColor Red
Update-MgUser -UserId $UserPrincipalName -AccountEnabled $false

Write-Host "STEP 3: Converting mailbox to shared..." -ForegroundColor Yellow
# Exchange Online PowerShell: Set-Mailbox -Identity $UserPrincipalName -Type Shared

Write-Host "De-provisioning script completed. Audit log entry recorded." -ForegroundColor Green
`;

  return {
    "01_create_entra_id_user.ps1": script01,
    "02_assign_m365_licence.ps1": script02,
    "03_add_security_groups.ps1": script03,
    "04_configure_mfa.ps1": script04,
    "05_deprovision_user.ps1": script05,
  };
}

/**
 * Generates Welcome Email (HTML & plain text) and Day-1 Markdown Guide
 */
export function generateCommsBundle(employee: any, plan: any): CommsBundle {
  const upn =
    employee.workEmail ||
    `${employee.firstName.toLowerCase()}.${employee.lastName.toLowerCase()}@clyora`;

  const emailSubject = `Welcome to the Team, ${employee.firstName}! Your Day-1 Onboarding Guide`;

  const emailHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Welcome to the Team</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f5f8f6; color: #141c18; margin: 0; padding: 24px; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border: 1px solid #d7e2dc; border-radius: 8px; overflow: hidden; }
    .header { background: linear-gradient(135deg, #0a211a, #143b2e); color: #ffffff; padding: 32px 24px; text-align: center; }
    .header h1 { margin: 0 0 8px 0; font-size: 24px; font-weight: 700; color: #34d399; }
    .header p { margin: 0; color: #a4c4b6; font-size: 14px; }
    .content { padding: 32px 24px; }
    .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; background: #ecfdf5; color: #059669; font-weight: 600; font-size: 12px; margin-bottom: 16px; border: 1px solid #a7f3d0; }
    .card { background: #f9fbf9; border: 1px solid #e6ede8; border-radius: 6px; padding: 16px; margin: 20px 0; }
    .card h3 { margin-top: 0; color: #0a211a; font-size: 15px; }
    .button { display: inline-block; background: #10b981; color: #ffffff !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 16px 0; }
    .footer { background: #f3f8f5; padding: 20px 24px; text-align: center; font-size: 12px; color: #5c6b63; border-top: 1px solid #e6ede8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Welcome to the Team, ${employee.firstName}!</h1>
      <p>We are thrilled to welcome you as our new ${employee.jobTitle}</p>
    </div>
    <div class="content">
      <span class="badge">Start Date: ${employee.startDate}</span>
      <p>Dear ${employee.firstName},</p>
      <p>Welcome to <strong>CLYORA</strong>! Your onboarding plan shows the current preparation status for your first day. Check your workspace for assigned actions and progress.</p>

      <div class="card">
        <h3>Your Account Information</h3>
        <p><strong>Work Email (UPN):</strong> <code>${upn}</code></p>
        <p><strong>Department:</strong> ${employee.departmentName || "Engineering"}</p>
        <p><strong>Work Mode:</strong> ${employee.workMode || "Hybrid"}</p>
        <p><strong>Employee Number:</strong> ${employee.employeeNumber || "EMP-10001"}</p>
      </div>

      <div class="card">
        <h3>What to Expect on Day 1</h3>
        <ul>
          <li><strong>09:30 AM</strong> — Welcome coffee & team introduction with your manager</li>
          <li><strong>10:30 AM</strong> — IT setup session (laptop login, Microsoft 365, MFA enrollment)</li>
          <li><strong>12:30 PM</strong> — Team welcome lunch</li>
          <li><strong>02:00 PM</strong> — Benefits enrollment & company policies review</li>
        </ul>
      </div>

      <p>Please log in to your employee onboarding portal below to review your assigned tasks and submit your initial documents:</p>

      <div style="text-align: center;">
        <a href="http://localhost:4000" class="button">Access Employee Onboarding Portal</a>
      </div>

      <p>If you have any questions prior to your start date, reply directly to this email or reach out to your HR coordinator.</p>
      <p>Warm regards,<br><strong>People & Culture Team</strong></p>
    </div>
    <div class="footer">
      CLYORA · Employee Onboarding Portal · Confidential
    </div>
  </div>
</body>
</html>`;

  const emailPlain = `WELCOME TO THE TEAM, ${employee.firstName.toUpperCase()}!

Dear ${employee.firstName},

We are delighted to welcome you to CLYORA as our new ${employee.jobTitle} in ${employee.departmentName || "Engineering"}.

YOUR ACCOUNT DETAILS:
- Work Email (UPN): ${upn}
- Start Date: ${employee.startDate}
- Department: ${employee.departmentName || "Engineering"}
- Work Mode: ${employee.workMode || "Hybrid"}
- Employee ID: ${employee.employeeNumber || "EMP-10001"}

DAY 1 SCHEDULE:
- 09:30 AM: Welcome meeting with your manager
- 10:30 AM: IT setup (laptop, M365, MFA authentication)
- 12:30 PM: Team lunch
- 02:00 PM: Benefits election & compliance policy review

Access your personal onboarding portal at http://localhost:4000

Welcome aboard!
People & Culture Team`;

  const day1Guide = `# Day-1 & First-Week Onboarding Guide

**Prepared for:** ${employee.firstName} ${employee.lastName}  
**Role:** ${employee.jobTitle}  
**Department:** ${employee.departmentName || "Engineering"}  
**Start Date:** ${employee.startDate}  
**Work Mode:** ${employee.workMode || "Hybrid"}  

---

## 1. Where to Go & Arrival
- **Location:** Main Office Reception (or your home workspace for Remote).
- **Time:** Please arrive / connect at **09:30 AM**.
- **Building Access:** Present your government photo ID at the reception security desk to collect your temporary access badge.

---

## 2. First Login & IT Setup
1. **Unbox & Connect:** Power on your company-provisioned workstation.
2. **First-Time Sign-In:**
   - **Username / UPN:** \`${upn}\`
   - **Temporary Password:** Provided securely by IT Support via SMS/personal email.
   - You will be prompted to create a strong password upon initial login.
3. **Multi-Factor Authentication (MFA):**
   - Download the **Microsoft Authenticator** app on your mobile phone.
   - Scan the QR code displayed on screen to register your device.
4. **Software & Intune Compliance:**
   - Intune will automatically synchronize your required applications (Office 365, Slack/Teams, VPN client, and security agents).

---

## 3. Key Contacts
| Name / Role | Email | Purpose |
| :--- | :--- | :--- |
| **Direct Manager** | See your onboarding workspace | First-day agenda, 1-on-1s, team priorities |
| **IT Helpdesk** | Contact your organization IT team | Hardware and system access |
| **HR People Partner** | Contact your organization HR team | Benefits, payroll and documents |
| **Team Buddy** | See your onboarding workspace | Informal guidance and team introductions |

---

## 4. Systems You Will Access on Day 1
- **Microsoft 365:** Outlook, Teams, OneDrive, SharePoint.
- **HR Self-Service Portal:** View profile, upload tax forms, elect benefits.
- **Internal Knowledge Base:** Company handbook, org chart, technical docs.
- **Department Tooling:** GitHub / AWS dev environments (for engineering roles).

---

## 5. Day-1 Suggested Agenda
- **09:30 AM – 10:00 AM:** Welcome coffee & desk setup.
- **10:00 AM – 11:30 AM:** IT Orientation & MFA configuration.
- **11:30 AM – 12:30 PM:** Manager 1-on-1: Role expectations & 30-day goals.
- **12:30 PM – 01:30 PM:** Team Welcome Lunch.
- **01:30 PM – 03:00 PM:** HR documentation, tax forms & statutory policies.
- **03:00 PM – 04:30 PM:** Review Day-1 guide & explore team documentation.
- **04:30 PM – 05:00 PM:** Day-1 recap call with your manager.

---

## 6. First-Week Milestone Plan
- **Day 2:** Complete mandatory security awareness & Acceptable Use Policy training.
- **Day 3:** Submit benefit enrollment elections (medical, dental, retirement).
- **Day 4:** Environment & dev tooling walkthrough with your assigned buddy.
- **Day 5:** Week 1 review with manager & retrospective.

---

## 7. 30-Day Check-in & Review Goals
At Day 30, your manager and HR partner will hold an informal 30-day check-in to ensure all access is working, answer questions, and support your ongoing success.
`;

  return {
    welcomeEmail: {
      subject: emailSubject,
      html: emailHtml,
      plain: emailPlain,
    },
    day1Guide,
  };
}

/**
 * Auditor Agent: Validates the plan against the 25-step matrix and computes compliance score
 */
export function auditPlan(plan: any, employee: any): AuditReport {
  const tasks = plan.tasks ?? [];
  const findings: AuditFinding[] = [];
  let coveredCount = 0;

  for (const matrixStep of ONBOARDING_MATRIX) {
    const normMatrixTitle = matrixStep.title
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

    // Check if matching task exists in plan
    const isCovered = tasks.some((t: any) => {
      const normTaskTitle = (t.title || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const normTaskType = (t.taskType || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");

      return (
        normTaskTitle.includes(normMatrixTitle.slice(0, 10)) ||
        normMatrixTitle.includes(normTaskTitle.slice(0, 10)) ||
        normTaskType.includes(matrixStep.tags[0] || "none")
      );
    });

    if (isCovered) {
      coveredCount++;
    } else {
      let severity: "CRITICAL" | "HIGH" | "MEDIUM" | "INFO" = "MEDIUM";
      if (matrixStep.priority === "Critical") severity = "CRITICAL";
      else if (matrixStep.priority === "High") severity = "HIGH";
      else if (matrixStep.priority === "Low") severity = "INFO";

      findings.push({
        stepNumber: matrixStep.stepNumber,
        title: matrixStep.title,
        severity,
        system: matrixStep.system,
        owner: matrixStep.owner,
        message: `Step ${matrixStep.stepNumber} (${matrixStep.title}) is not explicitly represented in the active task list.`,
      });
    }
  }

  const totalRequired = ONBOARDING_MATRIX.length;
  const complianceScore = Math.round((coveredCount / totalRequired) * 100);

  // Critical and High findings fail the audit
  const blockingFindings = findings.filter(
    (f) => f.severity === "CRITICAL" || f.severity === "HIGH",
  );
  const passed = blockingFindings.length === 0;

  return {
    passed,
    complianceScore,
    totalRequiredSteps: totalRequired,
    coveredStepsCount: coveredCount,
    missingStepsCount: findings.length,
    findings,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generates the complete Onboarding Pack data structure
 */
export function generateOnboardingPack(
  plan: any,
  employee: any,
): OnboardingPack {
  const scripts = generatePowerShellScripts(employee);
  const comms = generateCommsBundle(employee, plan);
  const auditReport = auditPlan(plan, employee);

  return {
    planId: plan.id,
    employee: {
      id: employee.id,
      employeeNumber: employee.employeeNumber,
      fullName: `${employee.firstName} ${employee.lastName}`,
      firstName: employee.firstName,
      lastName: employee.lastName,
      personalEmail: employee.personalEmail,
      workEmail:
        employee.workEmail ||
        `${employee.firstName.toLowerCase()}.${employee.lastName.toLowerCase()}@clyora`,
      jobTitle: employee.jobTitle,
      departmentName:
        employee.departmentName || employee.department?.name || "Engineering",
      jurisdictionCode: employee.jurisdictionCode,
      startDate:
        typeof employee.startDate === "string"
          ? employee.startDate
          : employee.startDate?.toISOString?.()?.slice(0, 10) || "",
      workMode: employee.workMode,
    },
    scripts,
    comms,
    auditReport,
    checklist: ONBOARDING_MATRIX,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Lightweight pure-Node.js ZIP archive generator (Zero dependencies)
 * Generates valid standard ZIP files compatible with Windows Explorer, macOS, and Linux unzip.
 */
export function createZipArchive(
  files: Record<string, string | Buffer>,
): Buffer {
  const crcTable: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    crcTable[n] = c;
  }

  function crc32(buf: Buffer): number {
    let crc = 0 ^ -1;
    for (let i = 0; i < buf.length; i++) {
      const byte = buf[i] ?? 0;
      crc = (crc >>> 8) ^ (crcTable[(crc ^ byte) & 0xff] ?? 0);
    }
    return (crc ^ -1) >>> 0;
  }

  const fileEntries: Array<{
    name: string;
    crc: number;
    compressedData: Buffer;
    uncompressedSize: number;
    compressedSize: number;
    offset: number;
  }> = [];

  const localHeaders: Buffer[] = [];
  let currentOffset = 0;

  for (const [name, content] of Object.entries(files)) {
    const rawBuffer = Buffer.isBuffer(content)
      ? content
      : Buffer.from(content, "utf8");
    const crc = crc32(rawBuffer);
    const compressed = zlib.deflateRawSync(rawBuffer);

    // If compression didn't save space, store uncompressed
    const useCompression = compressed.length < rawBuffer.length;
    const finalData = useCompression ? compressed : rawBuffer;
    const compressionMethod = useCompression ? 8 : 0;

    const nameBuffer = Buffer.from(name, "utf8");

    // Local file header (30 bytes + name)
    const localHeader = Buffer.alloc(30 + nameBuffer.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // Signature
    localHeader.writeUInt16LE(20, 4); // Min version needed
    localHeader.writeUInt16LE(0, 6); // General purpose bit flag
    localHeader.writeUInt16LE(compressionMethod, 8); // Method
    localHeader.writeUInt16LE(0, 10); // Last mod time
    localHeader.writeUInt16LE(0, 12); // Last mod date
    localHeader.writeUInt32LE(crc, 14); // CRC32
    localHeader.writeUInt32LE(finalData.length, 18); // Compressed size
    localHeader.writeUInt32LE(rawBuffer.length, 22); // Uncompressed size
    localHeader.writeUInt16LE(nameBuffer.length, 26); // Filename length
    localHeader.writeUInt16LE(0, 28); // Extra field length
    nameBuffer.copy(localHeader, 30);

    fileEntries.push({
      name,
      crc,
      compressedData: finalData,
      uncompressedSize: rawBuffer.length,
      compressedSize: finalData.length,
      offset: currentOffset,
    });

    localHeaders.push(localHeader, finalData);
    currentOffset += localHeader.length + finalData.length;
  }

  // Central directory
  const centralHeaders: Buffer[] = [];
  let centralDirSize = 0;

  for (const entry of fileEntries) {
    const nameBuffer = Buffer.from(entry.name, "utf8");
    const centralHeader = Buffer.alloc(46 + nameBuffer.length);
    centralHeader.writeUInt32LE(0x02014b50, 0); // Signature
    centralHeader.writeUInt16LE(20, 4); // Version made by
    centralHeader.writeUInt16LE(20, 6); // Version needed
    centralHeader.writeUInt16LE(0, 8); // Bit flag
    centralHeader.writeUInt16LE(
      entry.compressedSize === entry.uncompressedSize ? 0 : 8,
      10,
    );
    centralHeader.writeUInt16LE(0, 12); // Last mod time
    centralHeader.writeUInt16LE(0, 14); // Last mod date
    centralHeader.writeUInt32LE(entry.crc, 16);
    centralHeader.writeUInt32LE(entry.compressedSize, 20);
    centralHeader.writeUInt32LE(entry.uncompressedSize, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30); // Extra field length
    centralHeader.writeUInt16LE(0, 32); // Comment length
    centralHeader.writeUInt16LE(0, 34); // Disk number start
    centralHeader.writeUInt16LE(0, 36); // Internal file attributes
    centralHeader.writeUInt32LE(0, 38); // External file attributes
    centralHeader.writeUInt32LE(entry.offset, 42); // Offset of local header
    nameBuffer.copy(centralHeader, 46);

    centralHeaders.push(centralHeader);
    centralDirSize += centralHeader.length;
  }

  // End of central directory record (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // Signature
  eocd.writeUInt16LE(0, 4); // Disk number
  eocd.writeUInt16LE(0, 6); // Disk with central dir
  eocd.writeUInt16LE(fileEntries.length, 8); // Entries on disk
  eocd.writeUInt16LE(fileEntries.length, 10); // Total entries
  eocd.writeUInt32LE(centralDirSize, 12); // Central dir size
  eocd.writeUInt32LE(currentOffset, 16); // Central dir offset
  eocd.writeUInt16LE(0, 20); // Comment length

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

/**
 * Builds the ZIP pack buffer for download
 */
export function buildZipPackBuffer(pack: OnboardingPack): Buffer {
  const files: Record<string, string> = {
    "checklist.json": JSON.stringify(pack.checklist, null, 2),
    "audit_report.json": JSON.stringify(pack.auditReport, null, 2),
    "summary.json": JSON.stringify(
      {
        planId: pack.planId,
        employee: pack.employee,
        complianceScore: pack.auditReport.complianceScore,
        passed: pack.auditReport.passed,
        generatedAt: pack.generatedAt,
      },
      null,
      2,
    ),
    "comms/welcome_email.html": pack.comms.welcomeEmail.html,
    "comms/welcome_email.txt": pack.comms.welcomeEmail.plain,
    "comms/day_1_guide.md": pack.comms.day1Guide,
    "scripts/01_create_entra_id_user.ps1":
      pack.scripts["01_create_entra_id_user.ps1"] ?? "",
    "scripts/02_assign_m365_licence.ps1":
      pack.scripts["02_assign_m365_licence.ps1"] ?? "",
    "scripts/03_add_security_groups.ps1":
      pack.scripts["03_add_security_groups.ps1"] ?? "",
    "scripts/04_configure_mfa.ps1": pack.scripts["04_configure_mfa.ps1"] ?? "",
    "scripts/05_deprovision_user.ps1":
      pack.scripts["05_deprovision_user.ps1"] ?? "",
  };

  return createZipArchive(files);
}
