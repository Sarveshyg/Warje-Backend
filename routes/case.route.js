import express from "express"
import caseController from "../controllers/case.controller.js"
import caseIntercetor from "../interceptors/case.interceptor.js"
import { verifyToken } from "../interceptors/verifyToken.js"
import { checkTokenRefresh } from "../interceptors/checkTokenRefresh.js" 
import { validateStrictBody } from "../interceptors/auth.interceptor.js"

const router = express.Router()

router.use(verifyToken);
router.use(checkTokenRefresh);

router.post(
    "/", 
    validateStrictBody(["case_number", "title", "priority", "assigned_officer_emails", "section_under_ipc", "deadline", "under_7_years"]),
    caseIntercetor.validateCase, 
    caseController.createCase
);

router.get(
    "/",
    validateStrictBody([""]),
    caseIntercetor.validateGetCase,
    caseController.getCase
)

// specific user --> get total case count
router.get(
    "/count/:user_id", 
    validateStrictBody([""]),
    caseIntercetor.validateTotalCaseCount, 
    caseController.getTotalCaseCount
);

// get users case count {name: count}
router.get(
    "/user-count/", 
    validateStrictBody([""]),
    caseIntercetor.validateGetOfficersCasesCount, 
    caseController.getOfficersCaseCount
);

// get case by user-id
router.get(
    "/:user_id", 
    validateStrictBody([""]),
    caseIntercetor.validateGetCaseId, 
    caseController.getCaseById
);

// get case by email_id
router.get(
    "/",
    validateStrictBody(["email_id"]), 
    caseIntercetor.validateGetCaseEmailId, 
    caseController.getCaseByEmailId
);

router.patch(
    "/", 
    caseIntercetor.validateCaseUpdate, 
    caseController.updateCase
);

router.delete(
    "/:case_number", 
    validateStrictBody([""]),
    caseIntercetor.validateCaseDeletion, 
    caseController.deleteCase
);

export default router