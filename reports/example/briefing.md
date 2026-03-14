# Daily Briefing — Sunday, March 1, 2026

> Briefing #1 · 🟠 HIGH

> **Note:** This is an example report included with the Cyberspace repository to show
> what output looks like. Real reports are generated daily and saved to `reports/YYYY-MM-DD/`.

---

## Threat Landscape

**Overall threat level:** 🟠 HIGH

Active exploitation of multiple zero-days across Cisco, Microsoft, and Apple products,
combined with an AI-assisted mass compromise campaign affecting 600+ FortiGate devices
in 55 countries, keeps the threat landscape elevated. The most significant development
is the confirmation that low-skill threat actors are using commercial generative AI
to successfully execute mass exploitation campaigns — a threshold moment for the industry.

| Metric | Count |
|--------|-------|
| Notable new CVEs | 6+ |
| Actively exploited vulnerabilities | 8 (CISA KEV additions in Feb) |
| Breaches reported | 5+ |
| Ransomware incidents | 3 (Qilin, ShinyHunters active) |

**Key themes:** AI-assisted attacks, zero-day exploitation, ransomware, EU regulation
**Most affected regions:** US, Asia-Pacific, Global
**Forward look:** Fortinet patch compliance and Microsoft zero-day patching deadlines hit this week

---

## 🔴 Critical — Act Now

#### [Cisco SD-WAN Zero-Day Exploited Since 2023 — Emergency Directive Issued](https://www.cisa.gov/news-events/alerts/2026/02/10/cisa-adds-six-known-exploited-vulnerabilities-catalog)
**Source:** CISA / The Hacker News · **Published:** 2026-02-10
**Priority:** 🔴 · **Category:** ACTIVE THREATS

CVE-2026-20127 (CVSS 10.0) is a maximum-severity authentication bypass in Cisco Catalyst
SD-WAN Controller and Manager. Unauthenticated remote attackers can gain full admin access.
CISA issued Emergency Directive ED 26-03, requiring federal agencies to inventory SD-WAN
devices and apply updates by March 5, and harden environments by March 26. If you run
Cisco SD-WAN, inventory controllers immediately, apply the patch, and check for indicators
of compromise going back to 2023.

#### [Microsoft Patches 59 Flaws Including Six Actively Exploited Zero-Days](https://thehackernews.com/2026/02/microsoft-patches-59-vulnerabilities.html)
**Source:** The Hacker News · **Published:** 2026-02-11
**Priority:** 🔴 · **Category:** ACTIVE THREATS

Microsoft's February Patch Tuesday addressed 59 vulnerabilities, six of which are under
active exploitation: CVE-2026-21510 (Windows Shell), CVE-2026-21513 (MSHTML bypass),
CVE-2026-21514 (Office Word), CVE-2026-21519 (Windows type confusion), CVE-2026-21525
(NULL pointer deref), and CVE-2026-21533 (RDP EoP). All six were added to the CISA KEV
catalog with a March 3 remediation deadline. Verify these patches are deployed across your
Windows estate — prioritize the MSHTML and RDP EoP flaws.

#### [AI-Assisted Threat Actor Compromises 600+ FortiGate Devices in 55 Countries](https://thehackernews.com/2026/02/ai-assisted-threat-actor-compromises.html) 📣 **LinkedIn-worthy**
**Source:** Amazon Threat Intelligence · **Published:** 2026-02-26
**Priority:** 🔴 · **Category:** ACTIVE THREATS

A threat actor with limited technical skills leveraged multiple commercial generative AI
tools to breach over 600 FortiGate devices across 55 countries between January 11 and
February 18, 2026. The actor exploited weak credentials and exposed management ports.
This is a milestone case: AI is actively lowering the barrier to entry for mass exploitation.
Audit FortiGate management interfaces — ensure they are not internet-exposed and enforce
strong credentials. Review logs for the Jan–Feb timeframe.

---

## Top Stories

#### [Apple Patches Sophisticated Zero-Day Used in Targeted Spyware Attacks](https://www.cisa.gov/known-exploited-vulnerabilities-catalog)
**Source:** CISA / Apple · **Published:** 2026-02-18
**Priority:** 🟠 · **Category:** ACTIVE THREATS

CVE-2026-20700 (CVSS 7.8) is a memory buffer overflow affecting iOS, macOS, tvOS, watchOS,
and visionOS. Apple acknowledged it may have been exploited in "an extremely sophisticated
attack against specific targeted individuals," suggesting possible commercial spyware
involvement. Ensure all Apple devices are updated. Watch for follow-up attribution.

#### [ScarCruft (APT37) Deploys New Toolkit to Breach Air-Gapped Networks](https://www.bleepingcomputer.com/news/security/apt37-hackers-use-new-malware-to-breach-air-gapped-networks/)
**Source:** BleepingComputer / Zscaler ThreatLabz · **Published:** 2026-02-27
**Priority:** 🟠 · **Category:** THREAT ACTORS

North Korea's APT37 (ScarCruft) launched the "Ruby Jumper" campaign with a new toolkit
including RESTLEAF (Zoho WorkDrive C2 backdoor), THUMBSBD and VIRUSTASK (USB-based
air-gap bridging malware), and several surveillance implants. The malware weaponizes
removable media as a bidirectional C2 relay, enabling data exfiltration from isolated
networks. Review USB/removable media policies and monitor for unusual Zoho WorkDrive traffic.

#### [CrowdStrike Reports 89% Increase in AI-Enabled Adversary Activity](https://www.infosecurity-magazine.com/news/ai-powered-cyberattacks-up/) 📣 **LinkedIn-worthy**
**Source:** CrowdStrike Global Threat Report 2026 · **Published:** 2026-02-20
**Priority:** 🟠 · **Category:** AI & SECURITY

CrowdStrike's 2026 threat report documents an 89% year-over-year increase in attacks by
AI-enabled adversaries. Attackers are deploying AI across social engineering, malware
development, and disinformation campaigns. Cisco's parallel report notes that autonomous
AI agents are now being used operationally by threat actors. Factor AI-augmented attacks
into your threat models and evaluate whether detection capabilities can handle AI-generated
phishing and polymorphic malware.

---

## Active Threats

#### [FileZen OS Command Injection Under Active Exploitation](https://www.cisa.gov/news-events/alerts/2026/02/24/cisa-adds-one-known-exploited-vulnerability-catalog)
**Source:** CISA · **Published:** 2026-02-24
**Priority:** 🟠 · **Category:** ACTIVE THREATS

CVE-2026-25108 (CVSS 8.7) is an OS command injection flaw in Soliton FileZen that allows
authenticated users to execute arbitrary commands when the Antivirus Check Option is enabled.
Soliton confirmed at least one reported exploitation. Added to CISA KEV. Patch immediately
and audit logs for suspicious command execution.

#### [BeyondTrust Vulnerability Being Rapidly Weaponized](https://thehackernews.com/2026/02/researchers-observe-in-wild.html)
**Source:** The Hacker News · **Published:** 2026-02-19
**Priority:** 🟠 · **Category:** ACTIVE THREATS

CVE-2026-1731 (CVSS 9.9) in BeyondTrust products is being exploited in the wild with a
significantly shortened disclosure-to-weaponization window. FCEB agencies were given a
March 5 deadline to remediate. Patch BeyondTrust immediately and check for unauthorized
access in logs.

---

## Breaches & Incidents

#### [CarGurus Breached by ShinyHunters — 1.7M Records Exposed](https://sharkstriker.com/blog/today-data-breaches-in-february-2026/)
**Source:** Multiple · **Published:** 2026-02-20
**Priority:** 🟠 · **Category:** BREACHES & INCIDENTS

ShinyHunters compromised CarGurus, exposing over 1.7M records and 12.6M accounts containing
PII and customer data. Monitor for credential stuffing if your users had CarGurus accounts.

#### [Conduent Breach Impact Expands — Millions Affected Across US States](https://www.foxnews.com/tech/conduent-data-breach-hits-millions-across-multiple-states)
**Source:** Fox News / Multiple · **Published:** 2026-02-22
**Priority:** 🟡 · **Category:** BREACHES & INCIDENTS

Impact estimates for the Conduent breach surged in February as Texas officials reported
significantly higher numbers. State investigations are intensifying as breach notifications
expand nationwide.

---

## Threat Actors

#### [China-Linked UAT-8837 Exploits Sitecore Zero-Day Against Critical Infrastructure](https://thehackernews.com/2026/01/china-linked-apt-exploits-sitecore-zero.html)
**Source:** Cisco Talos · **Published:** 2026-01-30
**Priority:** 🟠 · **Category:** THREAT ACTORS

Cisco Talos tracks UAT-8837 as a China-nexus APT targeting high-value organizations.
The group exploited CVE-2025-53690 (CVSS 9.0), a critical Sitecore zero-day. Tactical
overlaps link them to other known PRC-attributed campaigns. Verify Sitecore instances
are patched.

#### [Singapore Mounts Largest Cyber Operation Against Telecom-Targeting APT](https://www.csa.gov.sg/news-events/press-releases/largest-multi-agency-cyber-operation-mounted-to-counter-threat-posed-by-advanced-persistent-threat--apt--actor-unc3886-to-singapore-s-telecommunications-sector/)
**Source:** CSA Singapore · **Published:** 2026-02-25
**Priority:** 🟡 · **Category:** THREAT ACTORS

Singapore revealed "Operation Cyber Guardian," an eleven-month, multi-agency operation
to purge APT UNC3886 from four major telecom operators. UNC3886 used zero-day exploits
to bypass firewalls and deployed rootkits for persistent, undetected access. Singapore's
largest coordinated cyber incident response to date.

---

## AI & Security

#### [Darktrace Report: Shift From Exploit-Driven Breaches to AI-Enabled Credential Abuse](https://industrialcyber.co/news/darktrace-annual-threat-report-2026-finds-shift-from-exploit-driven-breaches-to-faster-ai-enabled-credential-abuse/)
**Source:** Darktrace · **Published:** 2026-02-18
**Priority:** 🟠 · **Category:** AI & SECURITY

Darktrace's 2026 Annual Threat Report highlights a fundamental shift: attackers are
increasingly bypassing traditional exploits in favor of credential abuse and identity-led
intrusions, with a 20% YoY increase in disclosed vulnerabilities. AI is enabling more
targeted, adaptive intrusions that evade traditional defenses. Strengthen identity-based
security controls — MFA, behavioral analytics, credential monitoring.

#### [LLM-Powered Ransomware Operates Autonomously Across All Attack Stages](https://www.infosecurity-magazine.com/news/ai-powered-cyberattacks-up/)
**Source:** Multiple research reports · **Published:** 2026-02-24
**Priority:** 🟠 · **Category:** AI & SECURITY

Researchers identified ransomware that uses LLMs across every attack stage — generating
custom code in real time, mapping systems to locate sensitive data, and operating without
human involvement. This represents a significant escalation in autonomous malware capability.
Evaluate AI-specific detection capabilities in your security stack.

---

## Policy & Regulation

#### [EU Cybersecurity Package: Cybersecurity Act 2 and NIS2 Amendments Proposed](https://www.globalpolicywatch.com/2026/01/european-commission-proposes-targeted-amendments-to-nis2-to-simplify-compliance-and-align-with-proposed-cybersecurity-act-2/)
**Source:** European Commission / Global Policy Watch · **Published:** 2026-01-20
**Priority:** 🟡 · **Category:** POLICY & REGULATION

The European Commission proposed a revised Cybersecurity Act (CSA 2) with strengthened
certification and ICT supply chain security, and targeted NIS2 amendments that clarify
jurisdiction, streamline ransomware data collection, and introduce a "small mid-cap"
category (under 750 employees, under €150M turnover) for lighter compliance. The Cyber
Resilience Act starts applying from September 11, 2026. Track NIS2 transposition in your
country and assess whether amendments affect your organization's obligations.

---

## Tools & Releases

#### [February 2026 Open Source Security Tool Roundup](https://www.helpnetsecurity.com/2026/02/26/hottest-cybersecurity-open-source-tools-of-the-month-february-2026/)
**Source:** Help Net Security · **Published:** 2026-02-26
**Priority:** 🟡 · **Category:** TOOLS & RELEASES

Notable releases:
- **Allama** — Open-source security automation platform with visual threat detection and response workflows; integrates with 80+ tools.
- **Brutus** — Multi-protocol credential testing tool in pure Go, single binary, zero dependencies.
- **Pompelmi** — Inserts malware scanning and policy checks into Node.js apps before files hit storage.

---

## Action Items

- [ ] **Patch Cisco SD-WAN** — If applicable, inventory controllers per ED 26-03 and apply fixes (deadline passed — check compliance status)
- [ ] **Verify Microsoft February patches** — Especially CVE-2026-21513 (MSHTML) and CVE-2026-21533 (RDP EoP)
- [ ] **Audit FortiGate management interfaces** — Ensure no exposed ports; rotate credentials; check logs from Jan 11–Feb 18
- [ ] **Review USB/removable media policies** — ScarCruft's air-gap bridging technique is a reminder to enforce controls
- [ ] **Evaluate AI-augmented threat detection** — The 89% increase in AI-enabled attacks demands a response in defensive tooling
- [ ] **Track EU NIS2 transposition** — New amendments may change compliance obligations

---

## Further Reading

- [Darktrace Annual Threat Report 2026](https://industrialcyber.co/news/darktrace-annual-threat-report-2026-finds-shift-from-exploit-driven-breaches-to-faster-ai-enabled-credential-abuse/) — Deep analysis of the shift toward credential-based and AI-enabled attacks
- [CrowdStrike Global Threat Report 2026](https://www.infosecurity-magazine.com/news/ai-powered-cyberattacks-up/) — 89% increase in AI-powered adversary activity
- [EU Cybersecurity Package 2026 — NIS2 Amendments](https://www.globalpolicywatch.com/2026/01/european-commission-proposes-targeted-amendments-to-nis2-to-simplify-compliance-and-align-with-proposed-cybersecurity-act-2/) — Detailed breakdown of the proposed changes
- [ScarCruft Ruby Jumper Campaign Analysis](https://www.bleepingcomputer.com/news/security/apt37-hackers-use-new-malware-to-breach-air-gapped-networks/) — Technical details on APT37's new air-gap bridging toolkit

---

*Briefing #1 · Generated 2026-03-01T08:00:00Z · Cyberspace Intelligence System v2.0*
