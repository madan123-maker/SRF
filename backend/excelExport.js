import ExcelJS from 'exceljs';
import { Application, ApplicationAnswer, FormField, User, Edition, ReformArea } from './db.js';

export const exportApplicationsToExcel = async (req, res) => {
  if (!req.user || req.user.role === 'user') {
    return res.status(403).json({ error: 'Access denied: Only Admins and Super Admins can export data.' });
  }
  try {
    const timestamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="SRF_Compliance_Report_${timestamp}.xlsx"`);

    const workbook = new ExcelJS.Workbook();
    
    // -------------------------------------------------------------
    // SHEET 1: Master Combined Compliance Table (Phase 6)
    // -------------------------------------------------------------
    const worksheet = workbook.addWorksheet('Combined Compliance');
    const docWorksheet = workbook.addWorksheet('Document Exports');

    docWorksheet.columns = [
      { header: 'Application ID', key: 'appId', width: 25 },
      { header: 'Form Name', key: 'formName', width: 25 },
      { header: 'User Name', key: 'userName', width: 25 },
      { header: 'Organization', key: 'organization', width: 30 },
      { header: 'Question Number', key: 'qNum', width: 15 },
      { header: 'File Name', key: 'fileName', width: 30 },
      { header: 'File Type', key: 'fileType', width: 20 },
      { header: 'Upload Date', key: 'uploadDate', width: 20 },
      { header: 'Uploaded By', key: 'uploadedBy', width: 20 },
      { header: 'Download Link', key: 'downloadLink', width: 30 }
    ];
    const docHeaderRow = docWorksheet.getRow(1);
    docHeaderRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    docHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
    
    const { editionId } = req.query;
    
    // Fetch Metadata
    const editions = await Edition.find().lean();
    const reformAreas = await ReformArea.find(editionId ? { editionId } : {}).lean();
    const users = await User.find().lean();
    
    const formFieldQuery = editionId ? { editionId } : {};
    const formFields = await FormField.find(formFieldQuery).sort({ editionId: 1, orderIndex: 1 }).lean();

    const userMap = new Map(users.map(u => [u.id, u]));
    const editionMap = new Map(editions.map(e => [e.id, e]));
    const reformAreaMap = new Map(reformAreas.map(r => [r.id, r]));

    const columns = [
      { header: 'Application ID', key: 'appId', width: 25 },
      { header: 'Application Name', key: 'appName', width: 25 },
      { header: 'Application Status', key: 'appStatus', width: 15 },
      { header: 'Submission Date', key: 'submissionDate', width: 15 },
      { header: 'User Name', key: 'userName', width: 25 },
      { header: 'User Email', key: 'userEmail', width: 25 },
      { header: 'Organization', key: 'organization', width: 30 },
      { header: 'Contact Info', key: 'contactInfo', width: 20 },
      { header: 'Assigned Admin', key: 'assignedAdmin', width: 20 },
      { header: 'Assigned Reviewer', key: 'assignedReviewer', width: 20 },
      { header: 'Assigned Reform Area', key: 'reformArea', width: 35 },
      { header: 'Assigned Action Point', key: 'actionPoint', width: 35 },
      { header: 'Approval Status', key: 'qStatus', width: 20 },
      { header: 'Remarks / Evaluator Remarks', key: 'remarks', width: 30 },
      { header: 'Review Comments', key: 'reviewComments', width: 40 },
      { header: 'Question Number', key: 'qNum', width: 15 },
      { header: 'Question Text', key: 'qText', width: 45 },
      { header: 'Submitted Answer', key: 'answer', width: 25 },
      { header: 'Document Name', key: 'docName', width: 30 },
      { header: 'Document Download Link', key: 'docLink', width: 30 },
      { header: 'Document Status', key: 'docStatus', width: 15 }
    ];

    worksheet.columns = columns;

    // Style the header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } }; // Dark indigo header

    // Query only submitted applications (exclude drafts)
    const appQuery = { status: { $ne: 'Draft' } };
    if (editionId) {
      appQuery.editionId = editionId;
    }
    const applications = await Application.find(appQuery).lean();

    const host = req.headers.host || 'localhost:3000';
    const protocol = req.secure ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;

    for (const app of applications) {
      const userObj = userMap.get(app.userId) || {};
      const ed = editionMap.get(app.editionId) || {};
      
      const answers = await ApplicationAnswer.find({ applicationId: app.id }).lean();
      const answersMap = new Map(answers.map(a => [a.fieldId, a]));

      // Get assigned admin and reviewer names
      const reviewerUserObj = app.assignedReviewer ? userMap.get(app.assignedReviewer) : null;
      const assignedReviewerName = reviewerUserObj ? (reviewerUserObj.name || reviewerUserObj.username) : 'N/A';
      
      // Assigned Admin can be the lock holder or supervisor
      const adminUserObj = app.reviewLockedBy ? userMap.get(app.reviewLockedBy) : null;
      const assignedAdminName = adminUserObj ? (adminUserObj.name || adminUserObj.username) : assignedReviewerName;

      // Compile timeline/review comments
      const reviewCommentsStr = (app.timeline || [])
        .map(t => `${t.action} by ${t.by} (${t.remarks || 'No remarks'})`)
        .join('; ');

      for (const field of formFields) {
        if (['heading', 'subheading', 'description', 'instruction', 'divider'].includes(field.fieldType)) {
          continue;
        }

        const ans = answersMap.get(field.id);
        const ra = reformAreaMap.get(field.reformAreaId) || {};

        let answerText = '';
        if (ans && ans.value !== undefined && ans.value !== null) {
          let parsedValue = ans.value;
          if (typeof parsedValue === 'string') {
            const valStr = parsedValue.trim();
            if (valStr.startsWith('{') && valStr.endsWith('}')) {
              try { parsedValue = JSON.parse(valStr); } catch (e) {}
            } else if (valStr.startsWith('[') && valStr.endsWith(']')) {
              try { parsedValue = JSON.parse(valStr); } catch (e) {}
            }
          }

          if (parsedValue && typeof parsedValue === 'object') {
            if (Array.isArray(parsedValue)) {
              answerText = parsedValue.join(', ');
            } else {
              const parts = [];
              let elementsList = field.elements || [];
              if (typeof elementsList === 'string') {
                try { elementsList = JSON.parse(elementsList); } catch (e) { elementsList = []; }
              }
              const elementMap = new Map((elementsList || []).map(el => [el.id, el]));
              for (const [elId, elVal] of Object.entries(parsedValue)) {
                const el = elementMap.get(elId);
                const label = el ? (el.label || el.name || elId) : elId;
                let displayVal = 'N/A';
                if (elVal !== undefined && elVal !== null && elVal !== '') {
                  if (Array.isArray(elVal)) {
                    displayVal = elVal.join(', ');
                  } else if (typeof elVal === 'object') {
                    displayVal = JSON.stringify(elVal);
                  } else {
                    displayVal = String(elVal);
                  }
                }
                parts.push(`${label}: ${displayVal}`);
              }
              answerText = parts.length > 0 ? parts.join('; ') : 'N/A';
            }
          } else {
            answerText = String(parsedValue).trim();
          }
        }
        if (!answerText) answerText = 'N/A';

        const baseRow = {
          appId: app.id,
          appName: ed.name || app.editionId || 'N/A',
          appStatus: app.status || 'N/A',
          submissionDate: app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : 'N/A',
          userName: userObj.name || userObj.username || 'N/A',
          userEmail: userObj.email || 'N/A',
          organization: app.organization || userObj.organization || 'N/A',
          contactInfo: userObj.mobile || userObj.phone || userObj.nodalOfficer || 'N/A',
          assignedAdmin: assignedAdminName,
          assignedReviewer: assignedReviewerName,
          reformArea: ra.name || field.reformAreaId || 'N/A',
          actionPoint: field.actionPointTitle || 'N/A',
          qStatus: ans?.questionStatus || 'N/A',
          remarks: ans?.adminRemarks || 'N/A',
          reviewComments: reviewCommentsStr || 'N/A',
          qNum: field.num || 'N/A',
          qText: field.label || field.text || 'N/A',
          answer: answerText
        };

        const files = ans?.files || [];
        if (files.length > 0) {
          for (const file of files) {
            const downloadUrl = `${baseUrl}/api/download-file/${app.id}/${field.id}/${file.docId}`;
            const fileRow = {
              ...baseRow,
              docName: file.name || 'N/A',
              docLink: { text: 'Download Document', hyperlink: downloadUrl },
              docStatus: file.fileStatus || 'N/A'
            };
            worksheet.addRow(fileRow);

            // Add to Document Exports sheet
            docWorksheet.addRow({
              appId: app.id,
              formName: ed.name || app.editionId || 'N/A',
              userName: userObj.name || userObj.username || 'N/A',
              organization: app.organization || userObj.organization || 'N/A',
              qNum: field.num || 'N/A',
              fileName: file.name || 'N/A',
              fileType: file.type || 'N/A',
              uploadDate: file.uploadedAt ? new Date(file.uploadedAt).toLocaleDateString() : 'N/A',
              uploadedBy: userObj.username || 'N/A',
              downloadLink: { text: 'Download File', hyperlink: downloadUrl }
            });
          }
        } else {
          const emptyFileRow = {
            ...baseRow,
            docName: 'N/A',
            docLink: 'N/A',
            docStatus: 'N/A'
          };
          worksheet.addRow(emptyFileRow);
        }
      }
    }

    // -------------------------------------------------------------
    // SHEET 2+: Individual Application Reports (Phase 7)
    // -------------------------------------------------------------
    for (const app of applications) {
      const userObj = userMap.get(app.userId) || {};
      const ed = editionMap.get(app.editionId) || {};
      const answers = await ApplicationAnswer.find({ applicationId: app.id }).lean();
      const answersMap = new Map(answers.map(a => [a.fieldId, a]));

      const reviewerUserObj = app.assignedReviewer ? userMap.get(app.assignedReviewer) : null;
      const assignedReviewerName = reviewerUserObj ? (reviewerUserObj.name || reviewerUserObj.username) : 'N/A';
      
      const adminUserObj = app.reviewLockedBy ? userMap.get(app.reviewLockedBy) : null;
      const assignedAdminName = adminUserObj ? (adminUserObj.name || adminUserObj.username) : assignedReviewerName;

      // Excel sheet name limit is 30 characters
      const stateOrOrg = app.state || app.organization || app.id;
      const sheetName = `Report - ${stateOrOrg}`.substring(0, 30);
      const appSheet = workbook.addWorksheet(sheetName);

      // Section 1: User Details
      appSheet.addRow(['SECTION 1: USER DETAILS']).font = { bold: true, size: 12 };
      appSheet.getRow(appSheet.lastRow.number).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAEAEF' } };
      
      appSheet.addRow(['User Name', userObj.name || userObj.username || 'N/A']);
      appSheet.addRow(['Email', userObj.email || 'N/A']);
      appSheet.addRow(['Organization', app.organization || userObj.organization || 'N/A']);
      appSheet.addRow(['Contact Information', userObj.mobile || userObj.phone || userObj.nodalOfficer || 'N/A']);
      appSheet.addRow([]); // Blank row

      // Section 2: Application Information
      appSheet.addRow(['SECTION 2: APPLICATION INFORMATION']).font = { bold: true, size: 12 };
      appSheet.getRow(appSheet.lastRow.number).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAEAEF' } };
      
      appSheet.addRow(['Application ID', app.id]);
      appSheet.addRow(['Form Name', ed.name || app.editionId || 'N/A']);
      appSheet.addRow(['Submission Date', app.submittedAt ? new Date(app.submittedAt).toLocaleDateString() : 'N/A']);
      appSheet.addRow(['Current Status', app.status || 'N/A']);
      appSheet.addRow(['Assigned Admin', assignedAdminName]);
      appSheet.addRow(['Assigned Reviewer', assignedReviewerName]);
      appSheet.addRow([]); // Blank row

      // Section 3: Question-by-Question Responses
      appSheet.addRow(['SECTION 3: QUESTION-BY-QUESTION RESPONSES']).font = { bold: true, size: 12 };
      appSheet.getRow(appSheet.lastRow.number).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAEAEF' } };
      
      // Question Table Headers
      appSheet.addRow(['Question Number', 'Question Text', 'Answer', 'Remarks']).font = { bold: true };
      appSheet.getRow(appSheet.lastRow.number).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } };
      appSheet.getRow(appSheet.lastRow.number).font = { bold: true, color: { argb: 'FFFFFFFF' } };

      for (const field of formFields) {
        if (['heading', 'subheading', 'description', 'instruction', 'divider'].includes(field.fieldType)) {
          continue;
        }

        const ans = answersMap.get(field.id);
        let answerText = '';
        if (ans && ans.value !== undefined && ans.value !== null) {
          let parsedValue = ans.value;
          if (typeof parsedValue === 'string') {
            const valStr = parsedValue.trim();
            if (valStr.startsWith('{') && valStr.endsWith('}')) {
              try { parsedValue = JSON.parse(valStr); } catch (e) {}
            } else if (valStr.startsWith('[') && valStr.endsWith(']')) {
              try { parsedValue = JSON.parse(valStr); } catch (e) {}
            }
          }

          if (parsedValue && typeof parsedValue === 'object') {
            if (Array.isArray(parsedValue)) {
              answerText = parsedValue.join(', ');
            } else {
              const parts = [];
              let elementsList = field.elements || [];
              if (typeof elementsList === 'string') {
                try { elementsList = JSON.parse(elementsList); } catch (e) { elementsList = []; }
              }
              const elementMap = new Map((elementsList || []).map(el => [el.id, el]));
              for (const [elId, elVal] of Object.entries(parsedValue)) {
                const el = elementMap.get(elId);
                const label = el ? (el.label || el.name || elId) : elId;
                let displayVal = 'N/A';
                if (elVal !== undefined && elVal !== null && elVal !== '') {
                  if (Array.isArray(elVal)) {
                    displayVal = elVal.join(', ');
                  } else if (typeof elVal === 'object') {
                    displayVal = JSON.stringify(elVal);
                  } else {
                    displayVal = String(elVal);
                  }
                }
                parts.push(`${label}: ${displayVal}`);
              }
              answerText = parts.length > 0 ? parts.join('; ') : 'N/A';
            }
          } else {
            answerText = String(parsedValue).trim();
          }
        }
        if (!answerText) answerText = 'N/A';

        appSheet.addRow([
          field.num || 'N/A',
          field.label || field.text || 'N/A',
          answerText,
          ans?.adminRemarks || ans?.remarks || 'N/A'
        ]);
      }

      // Column widths for the individual report sheets
      appSheet.getColumn(1).width = 25;
      appSheet.getColumn(2).width = 40;
      appSheet.getColumn(3).width = 30;
      appSheet.getColumn(4).width = 30;
    }

    await workbook.xlsx.write(res);
    res.end();
    console.log('[Export] Excel export streaming completed.');
  } catch (error) {
    console.error('Error generating combined Excel export:', error);
    if (!res.headersSent) {
      res.status(500).send('Error generating export');
    }
  }
};
