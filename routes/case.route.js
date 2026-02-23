import express from "express"
import caseController from "../controllers/case.controller.js"
import caseIntercetor from "../interceptors/case.interceptor.js"
import { verifyToken } from "../interceptors/verifyToken.js"
import { checkTokenRefresh } from "../interceptors/checkTokenRefresh.js"
import { validateStrictBody } from "../interceptors/auth.interceptor.js"
import { caseSearchLimiter } from "../interceptors/rate_limiter.js"

const router = express.Router()

router.use(verifyToken);
router.use(checkTokenRefresh);

// {"case_number", "title", "priority", "assigned_officer_emails", "section_under_ipc", "deadline", "under_7_years"}
router.post(
    "/",
    // caseSearchLimiter,
    validateStrictBody(["case_number", "title", "priority", "assigned_officer_emails", "section_under_ipc", "deadline", "under_7_years"]),
    caseIntercetor.validateCase,
    caseController.createCase
);

// get case by email_id
router.post(
    "/search",
    // caseSearchLimiter,
    validateStrictBody(["email_id"]),
    caseIntercetor.validateGetCaseEmailId,
    caseController.getCaseByEmailId
);

// get all deleted cases 
router.get(
    "/deleted-case",
    // caseSearchLimiter
    validateStrictBody([""]),
    caseController.getDeletedCase
);

// make deleted case to valid case
router.patch(
    "/deleted-case",
    // caseSearchLimiter,
    validateStrictBody(["case_id", "officer_ids"]),
    caseIntercetor.updateDeletedCaseValidate,
    caseController.updateDeletedCase
)

// get users case count with user_id or without user id which includes both status also {using query_param}
//{ req.query.user_id, req.query.status };
router.get(
    "/count",
    // caseSearchLimiter,
    validateStrictBody([""]),
    caseIntercetor.validateGetOfficersCasesCount,
    caseController.getOfficersCaseCount
);

// {can get all case or specific case by query params-> case_number='___'}
router.get(
    "/",
    // caseSearchLimiter,
    validateStrictBody([""]),
    caseIntercetor.validateGetCase,
    caseController.getCase
)

// get case by user-id
router.get(
    "/:user_id",
    // caseSearchLimiter,
    validateStrictBody([""]),
    caseIntercetor.validateGetCaseId,
    caseController.getCaseByUserID
);

// update case
router.patch(
    "/",
    // caseSearchLimiter,
    caseIntercetor.validateCaseUpdate,
    caseController.updateCase
);

// delete case
router.delete(
    "/:case_number",
    // caseSearchLimiter,
    validateStrictBody([""]),
    caseIntercetor.validateCaseDeletion,
    caseController.deleteCase
);

export default router