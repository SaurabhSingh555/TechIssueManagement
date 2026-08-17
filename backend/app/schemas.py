"""Pydantic request schemas — validation happens here before any business logic."""
from typing import Optional
from pydantic import BaseModel, Field


class IssueCreate(BaseModel):
    client_id: str
    process_id: Optional[str] = None
    category_id: Optional[str] = None
    issue_title: str = Field(min_length=5, max_length=300)
    issue_description: str = Field(min_length=5)
    business_impact: str = ""
    priority: str = "Medium"
    reported_by: str = ""
    assigned_to: Optional[str] = None
    system_name: str = ""
    error_message: str = ""
    client_wide_check_required: bool = False
    monitoring_required: bool = False
    monitoring_period: Optional[int] = None
    attachment_file_name: Optional[str] = None
    attachment_file_type: Optional[str] = None


class IssueUpdate(BaseModel):
    issue_title: Optional[str] = None
    issue_description: Optional[str] = None
    business_impact: Optional[str] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    client_id: Optional[str] = None
    process_id: Optional[str] = None
    category_id: Optional[str] = None
    system_name: Optional[str] = None
    error_message: Optional[str] = None
    root_cause: Optional[str] = None
    temporary_solution: Optional[str] = None
    permanent_solution: Optional[str] = None
    solution_implemented_date: Optional[str] = None
    testing_status: Optional[str] = None
    testing_result: Optional[str] = None
    global_fix_required: Optional[bool] = None
    global_fix_status: Optional[str] = None
    monitoring_required: Optional[bool] = None


class RcaCreate(BaseModel):
    root_cause: str = Field(min_length=5)
    technical_cause: str = ""
    process_cause: str = ""
    contributing_factors: str = ""
    temporary_fix: str = ""
    permanent_fix: str = ""
    preventive_action: str = ""
    owner: str = ""
    status: str = "In Progress"
    remarks: str = ""


class SolutionCreate(BaseModel):
    solution_description: str = Field(min_length=5)
    solution_type: str = "Permanent"
    implemented_by: str = ""
    testing_required: bool = True
    solution_effective: str = "Pending"
    evidence_url: str = ""


class SolutionUpdate(BaseModel):
    implemented_date: Optional[str] = None
    implemented_by: Optional[str] = None
    testing_status: Optional[str] = None
    testing_result: Optional[str] = None
    solution_effective: Optional[str] = None
    evidence_url: Optional[str] = None
    remarks: Optional[str] = None


class ClientCheckUpdate(BaseModel):
    same_issue_found: bool = False
    severity: str = ""
    impact: str = ""
    fix_required: bool = False
    fix_implemented: bool = False
    monitoring_required: bool = False
    monitoring_status: str = "Pending"
    remarks: str = ""


class MonitoringStart(BaseModel):
    period_days: int = Field(ge=1, le=365)


class MonitoringLogCreate(BaseModel):
    issue_recurred: bool = False
    system_stable: bool = True
    result: str = "In Progress"
    remarks: str = ""


class RecurrenceCreate(BaseModel):
    recurrence_description: str = Field(min_length=5)
    same_issue: bool = True
    new_rca: str = ""
    new_solution: str = ""
    preventive_action: str = ""
    owner: str = ""
    status: str = "Open"


class CloseRequest(BaseModel):
    remarks: str = ""


class ReopenRequest(BaseModel):
    description: str = Field(min_length=5)


class ClientCreate(BaseModel):
    client_code: str = Field(min_length=2, max_length=20)
    client_name: str = Field(min_length=2)
    active: bool = True
    relevant_for_client_wide_check: bool = True
    owner: str = ""


class ClientUpdate(ClientCreate):
    pass


class ProcessCreate(BaseModel):
    process_name: str = Field(min_length=2)
    active: bool = True


class CategoryCreate(BaseModel):
    category_name: str = Field(min_length=2)
    active: bool = True


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    active: Optional[bool] = None


class SlaUpdate(BaseModel):
    Critical: int = Field(ge=1, le=365)
    High: int = Field(ge=1, le=365)
    Medium: int = Field(ge=1, le=365)
    Low: int = Field(ge=1, le=365)


class PeriodsUpdate(BaseModel):
    periods: list[int]


class RecipientCreate(BaseModel):
    email: str
    name: str = ""
    notify_critical: bool = True
    notify_high: bool = True
    notify_sla: bool = True
    active: bool = True


class RecipientUpdate(RecipientCreate):
    pass


# ---------------- AI similarity / historical RCA ----------------
class SimilarFindBody(BaseModel):
    search_text: str = ""


class RelationshipCreate(BaseModel):
    related_issue_id: str
    relationship_type: str = "same_issue"  # same_issue | related_issue | duplicate | recurrence | not_related
    similarity_score: Optional[float] = None
    note: str = ""


class ConfirmSimilar(BaseModel):
    related_issue_id: str
    relationship_type: str = "same_issue"  # same_issue (confirm) | not_related (reject)
    note: str = ""


class RcaUpdate(BaseModel):
    investigation: Optional[str] = None
    root_cause: Optional[str] = None
    technical_cause: Optional[str] = None
    process_cause: Optional[str] = None
    contributing_factors: Optional[str] = None
    temporary_fix: Optional[str] = None
    permanent_fix: Optional[str] = None
    preventive_action: Optional[str] = None
    owner: Optional[str] = None
    status: Optional[str] = None
    remarks: Optional[str] = None
    verification_notes: Optional[str] = None
    verified: Optional[bool] = None
    verified_by: Optional[str] = None


class SimilaritySettingsUpdate(BaseModel):
    high_threshold: float = Field(ge=0.01, le=1.0)
    medium_threshold: float = Field(ge=0.01, le=1.0)
