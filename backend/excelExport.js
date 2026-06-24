import ExcelJS from 'exceljs';
import { Application, ApplicationAnswer, FormField, User, Edition, ReformArea } from './db.js';

export const exportApplicationsToExcel = async (req, res) => {
  try {
    const timestamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="SRF_Compliance_Report_${timestamp}.xlsx"`);

    const options = {
      stream: res,
      useStyles: true,
      useSharedStrings: true
    };
    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter(options);
    const worksheet = workbook.addWorksheet('Compliance Table', {
      views: [{ state: 'frozen', ySplit: 1 }]
    });

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
      { header: 'User Name', key: 'userName', width: 25 },
      { header: 'Organization', key: 'organization', width: 30 },
      { header: 'State', key: 'state', width: 15 },
      { header: 'District', key: 'district', width: 15 },
      { header: 'Edition', key: 'edition', width: 15 },
      { header: 'Reform Area', key: 'reformArea', width: 35 },
      { header: 'Action Point', key: 'actionPoint', width: 35 },
      { header: 'Question Number', key: 'qNum', width: 15 },
      { header: 'Question Text', key: 'qText', width: 45 },
      { header: 'Submitted Answer', key: 'answer', width: 25 },
      { header: 'Document Name', key: 'docName', width: 30 },
      { header: 'Document Download Link', key: 'docLink', width: 30 },
      { header: 'Document Status', key: 'docStatus', width: 15 },
      { header: 'Question Review Status', key: 'qStatus', width: 20 },
      { header: 'Evaluator Remarks', key: 'remarks', width: 30 },
      { header: 'Question Score', key: 'score', width: 12 },
      { header: 'Max Score', key: 'maxScore', width: 12 },
      { header: 'Application Total Score', key: 'totalScore', width: 25 }
    ];

    worksheet.columns = columns;

    // Style the header row
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    worksheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } }; // Dark indigo header

    // Query all applications (including drafts)
    const appQuery = {};
    if (editionId) {
      appQuery.editionId = editionId;
    }
    const appCursor = Application.find(appQuery).lean().cursor();

    const host = req.headers.host || 'localhost:3000';
    const protocol = req.secure ? 'https' : 'http';
    const baseUrl = `${protocol}://${host}`;

    for await (const app of appCursor) {
      const user = userMap.get(app.userId) || {};
      const ed = editionMap.get(app.editionId) || {};
      
      const answers = await ApplicationAnswer.find({ applicationId: app.id }).lean();
      const answersMap = new Map(answers.map(a => [a.fieldId, a]));

      // Calculate total score of application answers
      const totalScoreVal = answers.reduce((sum, a) => sum + (a.questionScore || 0), 0);

      for (const field of formFields) {
        // Skip layout/instruction fields
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
              try {
                parsedValue = JSON.parse(valStr);
              } catch (e) {
                // Keep as string
              }
            } else if (valStr.startsWith('[') && valStr.endsWith(']')) {
              try {
                parsedValue = JSON.parse(valStr);
              } catch (e) {
                // Keep as string
              }
            }
          }

          if (parsedValue && typeof parsedValue === 'object') {
            if (Array.isArray(parsedValue)) {
              answerText = parsedValue.join(', ');
            } else {
              const parts = [];
              let elementsList = field.elements || [];
              if (typeof elementsList === 'string') {
                try {
                  elementsList = JSON.parse(elementsList);
                } catch (e) {
                  elementsList = [];
                }
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
        if (!answerText) {
          answerText = 'N/A';
        }

        const baseRow = {
          appId: app.id,
          userName: user.name || user.username || 'N/A',
          organization: app.organization || user.organization || 'N/A',
          state: user.state || 'N/A',
          district: user.district || 'N/A',
          edition: ed.name || app.editionId || 'N/A',
          reformArea: ra.name || field.reformAreaId || 'N/A',
          actionPoint: field.actionPointTitle || 'N/A',
          qNum: field.num || 'N/A',
          qText: field.label || field.text || 'N/A',
          answer: answerText,
          qStatus: ans?.questionStatus || 'N/A',
          remarks: ans?.adminRemarks || 'N/A',
          score: (ans && ans.questionScore !== undefined && ans.questionScore !== null) ? ans.questionScore : 'N/A',
          maxScore: field.maxScore || field.weight || 1,
          totalScore: totalScoreVal
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
            worksheet.addRow(fileRow).commit();
          }
        } else {
          const emptyFileRow = {
            ...baseRow,
            docName: 'N/A',
            docLink: 'N/A',
            docStatus: 'N/A'
          };
          worksheet.addRow(emptyFileRow).commit();
        }
      }
    }

    await workbook.commit();
    console.log('[Export] Combined compliance table Excel export streaming completed.');
  } catch (error) {
    console.error('Error generating combined Excel export:', error);
    if (!res.headersSent) {
      res.status(500).send('Error generating export');
    }
  }
};
