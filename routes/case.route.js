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

router.post(
    "/",
    // caseSearchLimiter,
    validateStrictBody(["case_number", "title", "priority", "assigned_officer_emails", "section_under_ipc", "deadline", "under_7_years"]),
    caseIntercetor.validateCase,
    caseController.createCase
);

// search case by email_id
router.post(
    "/search",
    // caseSearchLimiter,
    validateStrictBody(["email_id"]),
    caseIntercetor.validateGetCaseEmailId,
    caseController.getCaseByEmailId
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
    caseController.getCaseById
);

// get users case count with user_id or without user id which includes both status also
router.get(
    "/count/",
    // caseSearchLimiter,
    validateStrictBody([""]),
    caseIntercetor.validateGetOfficersCasesCount,
    caseController.getOfficersCaseCount
);

router.patch(
    "/",
    // caseSearchLimiter,
    caseIntercetor.validateCaseUpdate,
    caseController.updateCase
);

router.delete(
    "/:case_number",
    // caseSearchLimiter,
    validateStrictBody([""]),
    caseIntercetor.validateCaseDeletion,
    caseController.deleteCase
);

export default router