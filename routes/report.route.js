import express from "express"
import reportController from "../controllers/report.controller.js"
import reportInterceptor from "../interceptors/report.interceptor.js"
import { verifyToken } from "../interceptors/verifyToken.js"
import { checkTokenRefresh } from "../interceptors/checkTokenRefresh.js"
import { validateStrictBody } from "../interceptors/auth.interceptor.js"

const router = express.Router()

router.use(verifyToken);
router.use(checkTokenRefresh);

// {"report_number", "title", "priority", "assigned_officer_emails", "deadline"}
router.post(
    "/",
    validateStrictBody(["report_number", "title", "priority", "assigned_officer_emails", "deadline"]),
    reportInterceptor.validateReport,
    reportController.createReport
);

// get report by email_id
router.post(
    "/search",
    validateStrictBody(["email_id"]),
    reportInterceptor.validateGetReportEmailId,
    reportController.getReportByEmailId
);

// get all deleted reports 
router.get(
    "/deleted-report",
    reportController.getDeletedReports
);

// restore deleted report
router.patch(
    "/deleted-report",
    validateStrictBody(["report_id", "officer_ids"]),
    reportInterceptor.updateDeletedReportValidate,
    reportController.updateDeletedReport
)

// get users report count with user_id or without user id which includes both status also {using query_param}
//{ req.query.user_id, req.query.status };
router.get(
    "/count",
    reportInterceptor.validateGetOfficersReportsCount,
    reportController.getOfficersReportsCount
);

// {can get all reports or specific report by query params-> report_number='___'}
router.get(
    "/",
    reportInterceptor.validateGetReport,
    reportController.getReport
)

// get report by user-id
router.get(
    "/:user_id",
    reportInterceptor.validateGetReportId,
    reportController.getReportByUserId
);

// update report
router.patch(
    "/",
    reportInterceptor.validateReportUpdate,
    reportController.updateReport
);

// delete report
router.delete(
    "/:report_number",
    reportInterceptor.validateReportDeletion,
    reportController.deleteReport
);

export default router
