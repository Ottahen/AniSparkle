# XO License

**An open-source license built around credit, origin, and transparency.**

Created by **Ottahen** (stylized as **ℒ**) · [github.com/Ottahen](https://github.com/Ottahen)

[![License: XO](https://img.shields.io/badge/license-XO%201.0-blue)](LICENSE.md)

---

## Table of Contents

1. [What Is XO?](#what-is-xo)
2. [Philosophy](#philosophy)
3. [Package Contents](#package-contents)
4. [Core License Features (1–33)](#core-license-features-133)
5. [XO Ecosystem Features (34–40)](#xo-ecosystem-features-3440)
6. [Quick Start](#quick-start)
7. [Compliance Checklist](#compliance-checklist)
8. [FAQ](#faq)
9. [Comparison](#comparison)
10. [Roadmap](#roadmap)
11. [Contributing](#contributing)
12. [Disclaimer](#disclaimer)

---

## What Is XO?

XO is a permissive open-source license with one additional idea: **a project's history should travel with its code.** Anyone can use, modify, fork, and sell XO-licensed software, as long as they keep the credit and the origin record intact.

XO pairs the license with a small ecosystem of tools (registry, explorer, dashboard, GitHub integration, generators, and a documentation standard) that make following the license easy and visible.

## Philosophy

- **Freedom first.** Use it, change it, ship it, sell it.
- **Credit is not optional.** Authors should always be findable.
- **Origins matter.** Forks and derivatives should be able to trace where they came from.
- **Compliance should be easy.** Tools should do the boring parts automatically.
- **Transparency over gatekeeping.** Everything is plain text and machine-readable.

## Package Contents

| File | Purpose |
|---|---|
| `LICENSE` | Plain-text license for repositories and automated detection |
| `LICENSE.md` | Official, readable license text |
| `README.md` | Features, philosophy, and explanations (this file) |
| `XO-ORIGIN.json` | Machine-readable origin and attribution record |
| `XO-SPECIFICATION.md` | Technical specification |
| `LICENSE.pdf` | Convenient downloadable copy |

## Core License Features (1–33)

**Rights**
1. Free use for any purpose, including commercial
2. Modification allowed
3. Redistribution allowed
4. Sublicensing allowed
5. Selling copies allowed
6. Private use allowed
7. Worldwide, perpetual grant

**Attribution and Origin**
8. Copyright notice must be preserved
9. License name must be preserved
10. Attribution in documentation or "About" page for derivatives
11. Origin Record (`XO-ORIGIN.json`) must be preserved
12. Derivatives append their own origin entry
13. Earlier origin entries may not be removed or falsified
14. Modified files carry a change notice
15. Change entries in the Origin Record satisfy the notice rule

**Integrity**
16. No claiming original authorship
17. No implied endorsement
18. No use of authors' trademarks or logos
19. Reasonable attribution use of names is permitted

**Patents**
20. Contributor patent grant (worldwide, royalty-free)
21. Grant limited to claims infringed by the contribution
22. Patent grant ends if you start patent litigation over the Software

**Compliance and Termination**
23. Automatic termination on violation
24. 30-day cure period
25. Rights reinstated on cure
26. Cure period starts on awareness or notice

**Compatibility**
27. May be combined with other licenses
28. XO conditions persist for XO-licensed portions
29. Not copyleft: no requirement to release your own source
30. Works with dual-licensing arrangements

**Legal Basics**
31. "As is" warranty disclaimer
32. Limitation of liability
33. Plain-language summary included (non-binding)

## XO Ecosystem Features (34–40)

### 34. XO Registry
A public directory of projects that use XO licenses.
- Searchable by name, language, topic, and license version
- Projects register by adding `XO-ORIGIN.json` and submitting the repository URL
- Each entry shows license version, maintainers, and links to the origin graph

### 35. XO Origin Explorer
A visual interface for exploring project origins and derivative relationships.
- Interactive graph of forks, ports, and derivatives
- Timeline view of contributions and modifications
- Click any node to see its attribution and license status

### 36. XO Compliance Dashboard
Shows attribution and license compliance status.
- Per-project status: **Compliant**, **Needs Attention**, **Non-compliant**
- Checks for license file, copyright line, origin record, and change notices
- Exportable reports for teams and auditors

### 37. XO GitHub Integration
Automatically detects XO projects and checks attribution during pull requests.
- Detects `LICENSE` and `XO-ORIGIN.json`
- Comments on pull requests that remove or corrupt attribution
- Optional required status check for protected branches

### 38. XO Attribution Generator
Generates attribution files for projects automatically.
- Reads dependencies and their XO records
- Produces `ATTRIBUTION.md` or `NOTICE` files
- Supports CI usage so attribution stays current

### 39. XO Migration Tool
Helps developers transfer origin and attribution records when moving repositories.
- Carries history across hosts, organizations, and renames
- Rewrites `source` and `repository` fields, keeping the full chain
- Validates the record before and after the move

### 40. XO Documentation Standard
Provides a consistent format for documenting project origins, contributors, and modifications.
- Standard sections: Origin, Contributors, Modifications, Third-Party Notices
- Templates for README, CHANGELOG, and attribution pages
- Defined in [XO-SPECIFICATION.md](XO-SPECIFICATION.md)

## Quick Start

```bash
# 1. Copy license files into your project
cp LICENSE LICENSE.md XO-ORIGIN.json your-project/

# 2. Edit the copyright line in LICENSE
#    Copyright (c) 2026 Your Name

# 3. Fill in XO-ORIGIN.json (project name, authors, repository)

# 4. Commit
git add LICENSE LICENSE.md XO-ORIGIN.json
git commit -m "Add XO License 1.0"
```

**When you fork:** keep all existing files, add your entry to the `derivations` list in `XO-ORIGIN.json`, and mark modified files.

## Compliance Checklist

- [ ] `LICENSE` present and unmodified apart from the copyright line
- [ ] Copyright notice preserved
- [ ] `XO-ORIGIN.json` present and valid
- [ ] Derivation entry added (forks and derivatives)
- [ ] Modified files marked
- [ ] Attribution visible in docs or "About" page
- [ ] No claims of original authorship or endorsement

## FAQ

**Can I use XO software in a closed-source commercial product?**
Yes. XO is not copyleft. Keep the attribution and origin record.

**Do I have to publish my changes?**
No. You only have to record that a derivation exists and mark what you changed.

**What if I forget attribution?**
Your rights terminate automatically, but are reinstated if you fix it within 30 days.

**Can I relicense my fork?**
You may sublicense, but the XO conditions continue to apply to the XO-licensed portions.

**Is XO OSI-approved?**
Not unless and until it is submitted to and approved by the Open Source Initiative. Check the project page for current status.

## Comparison

| | XO | MIT | Apache-2.0 | GPL-3.0 |
|---|---|---|---|---|
| Commercial use | ✅ | ✅ | ✅ | ✅ |
| Modification | ✅ | ✅ | ✅ | ✅ |
| Attribution required | ✅ | ✅ | ✅ | ✅ |
| Origin record required | ✅ | ❌ | ❌ | ❌ |
| Patent grant | ✅ | ❌ | ✅ | ✅ |
| Copyleft | ❌ | ❌ | ❌ | ✅ |
| Cure period | 30 days | none | none | 30 days |

*Simplified for orientation, not legal advice.*

## Roadmap

- **1.0** License text, specification, origin record format
- **1.1** CLI validator and attribution generator
- **1.2** GitHub App for PR checks
- **2.0** Registry, Origin Explorer, and Compliance Dashboard public launch
- **Later** Language-specific SDKs, SPDX identifier submission, translations

## Contributing

Issues and pull requests are welcome at [github.com/Ottahen](https://github.com/Ottahen). Please discuss changes to the license text or specification in an issue first. Substantive license changes require a new version number.

## Disclaimer

The XO License was created by Ottahen (ℒ). This README and the license text are provided as-is and are not legal advice. Consult a qualified lawyer before relying on any license for commercial or high-stakes use.

---

**XO License · Created by Ottahen (ℒ) · [github.com/Ottahen](https://github.com/Ottahen)**
