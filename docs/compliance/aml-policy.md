# Bolster Ltd — Anti-Money Laundering Policy

**Version**: 1.0  
**Date**: April 2026  
**Owner**: [MLRO Name] — Money Laundering Reporting Officer  
**Review**: Annually or following material regulatory change

---

## 1. Purpose and scope

This policy sets out Bolster Ltd's obligations under the Money Laundering, Terrorist Financing and Transfer of Funds (Information on the Payer) Regulations 2017 (MLRs) and the Proceeds of Crime Act 2002 (POCA).

Bolster operates as a payment initiation agent under TrueLayer's FCA PISP licence. As an agent of a regulated firm, Bolster is subject to the MLRs and must maintain its own AML controls.

This policy applies to all Bolster employees, contractors, and agents.

---

## 2. Money Laundering Reporting Officer (MLRO)

**MLRO**: [Name]  
**Contact**: mlro@bolster.io  
**Responsibilities**:
- Receiving and evaluating internal Suspicious Activity Reports (SARs)
- Filing SARs to the National Crime Agency (NCA) via goAML where required
- Maintaining AML records for the minimum 5-year retention period
- Conducting annual AML policy review
- Ensuring staff training is current

In the MLRO's absence, [Deputy MLRO Name] acts as deputy.

---

## 3. Customer Due Diligence (CDD)

### 3.1 Recipients (persons receiving community payment support)

All recipients must complete identity verification before creating any invite link:

- **Verification provider**: Onfido
- **Method**: Government-issued photo ID + liveness check
- **Standard**: Document verification + facial similarity
- **KYC status gate**: Invite creation blocked until status is `approved`
- **Record retention**: Minimum 5 years from end of business relationship

### 3.2 Contributors (friends/family making payments)

Contributors are screened before payment initiation via Comply Advantage:

- **Screening**: UK Consolidated Sanctions List (OFSI), OFAC, UN sanctions, PEP databases
- **Threshold**: All contributors screened regardless of amount
- **Fuzziness**: 0.6 (adjustable by MLRO based on risk appetite)
- **Confirmed match**: Payment blocked; MLRO notified immediately
- **Potential match**: MLRO reviews within 24 hours; payment may be held pending review

### 3.3 Enhanced Due Diligence (EDD)

EDD is applied when:
- Contributor or recipient is a Politically Exposed Person (PEP)
- Transaction pattern is unusual (velocity, amount, frequency)
- Comply Advantage returns a potential or confirmed match
- MLRO discretion

EDD measures include: senior management approval, source of funds verification, enhanced ongoing monitoring.

---

## 4. Suspicious Activity Reporting

### 4.1 Internal SARs

Any Bolster employee who suspects money laundering or terrorist financing must report to the MLRO immediately using the internal SAR form. Do not alert the customer ("tipping off" is a criminal offence under POCA s.333A).

### 4.2 External SARs to NCA

The MLRO files SARs to the NCA via goAML within:
- **Defence SAR**: Before completing a transaction where suspicion exists (to obtain a "defence" under POCA)
- **Consent SAR**: Within 7 days of the MLRO forming suspicion where a transaction has already been completed

### 4.3 Record keeping

All SAR decisions (including decisions NOT to file) are recorded with rationale. Records retained 5 years minimum.

---

## 5. Transaction monitoring

Bolster's system automatically flags the following patterns for MLRO review:
- More than 5 payments through a single invite link in 24 hours
- Single contributor paying multiple recipients
- Payment amount significantly above stated debt balance
- Contributor in a high-risk jurisdiction
- Round number payments (potential structuring)

---

## 6. Training

All staff complete AML training on joining and annually thereafter. Training covers:
- Recognition of money laundering red flags
- Internal SAR reporting procedure
- Tipping-off prohibition
- Record-keeping obligations

Training completion is recorded in the HR system.

---

## 7. Record keeping

All CDD records, transaction records, and SAR decisions are retained for **5 years from the end of the business relationship** or **5 years from the date of the transaction**, whichever is later (MLR 2017, Reg 40).

Records are stored in encrypted form in AWS eu-west-2 (London). Access is restricted to authorised personnel.

---

## 8. Risk assessment

Bolster's inherent risk factors:
- **Lower risk**: Payments route directly to named creditors (councils, BNPL providers, banks) — not person-to-person
- **Lower risk**: Creditor accounts verified via Confirmation of Payee before use
- **Higher risk**: Digital-only onboarding (higher fraud risk than face-to-face)
- **Higher risk**: Vulnerable customers may be targeted by coercive control

Residual risk is assessed as **medium** after controls. Full risk assessment reviewed annually.

---

## 9. Policy review

This policy is reviewed annually by the MLRO and approved by the Board. Any material regulatory change triggers an immediate review.

**Last reviewed**: April 2026  
**Next review**: April 2027
