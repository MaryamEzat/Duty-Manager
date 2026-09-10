/*!
 * Copyright (C) Microsoft Corporation. All rights reserved.
 * This file is auto-generated. Do not modify it manually.
 * Changes to this file may be overwritten.
 */

export const dataSourcesInfo = {
  "and_earlydischarge_ipdvisitses": {
    "tableId": "",
    "version": "",
    "primaryKey": "and_earlydischarge_ipdvisitsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "and_earlydischarges": {
    "tableId": "",
    "version": "",
    "primaryKey": "and_earlydischargeid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "and_inpatientlists": {
    "tableId": "",
    "version": "",
    "primaryKey": "and_inpatientlistid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "calculaterollupfield": {
    "tableId": "",
    "version": "",
    "primaryKey": "",
    "dataSourceType": "Dataverse",
    "apis": {
      "CalculateRollupField": {
        "path": "/api/data/v9.2/CalculateRollupField",
        "method": "GET",
        "parameters": [
          {
            "name": "Target",
            "in": "query",
            "required": true,
            "type": "object"
          },
          {
            "name": "FieldName",
            "in": "query",
            "required": true,
            "type": "string"
          }
        ],
        "responseInfo": {
          "200": {
            "type": "object"
          }
        }
      }
    }
  },
  "cr301_ervisitses": {
    "tableId": "",
    "version": "",
    "primaryKey": "cr301_ervisitsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "crad2_patientdischarges": {
    "tableId": "",
    "version": "",
    "primaryKey": "crad2_patientdischargeid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "dma_administrativeissueentries": {
    "tableId": "",
    "version": "",
    "primaryKey": "dma_administrativeissueentryid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "dma_administrativeissues": {
    "tableId": "",
    "version": "",
    "primaryKey": "dma_administrativeissueid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "dma_alerts": {
    "tableId": "",
    "version": "",
    "primaryKey": "dma_alertid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "dma_coverageshortages": {
    "tableId": "",
    "version": "",
    "primaryKey": "dma_coverageshortageid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "dma_eventcodes": {
    "tableId": "",
    "version": "",
    "primaryKey": "dma_eventcodeid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "dma_eventtypes": {
    "tableId": "",
    "version": "",
    "primaryKey": "dma_eventtypeid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "dma_facilitycapacities": {
    "tableId": "",
    "version": "",
    "primaryKey": "dma_facilitycapacityid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "dma_handoverreports": {
    "tableId": "",
    "version": "",
    "primaryKey": "dma_handoverreportid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "dma_hospitalevents": {
    "tableId": "",
    "version": "",
    "primaryKey": "dma_hospitaleventid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "dma_opeartions": {
    "tableId": "",
    "version": "",
    "primaryKey": "dma_opeartionid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "dma_patientexperiences": {
    "tableId": "",
    "version": "",
    "primaryKey": "dma_patientexperienceid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "dma_patientflowentries": {
    "tableId": "",
    "version": "",
    "primaryKey": "dma_patientflowentryid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "dma_patientflowsummaries": {
    "tableId": "",
    "version": "",
    "primaryKey": "dma_patientflowsummaryid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hx_categories": {
    "tableId": "",
    "version": "",
    "primaryKey": "hx_categoryid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "hx_subcategories": {
    "tableId": "",
    "version": "",
    "primaryKey": "hx_subcategoryid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "ipd_patients": {
    "tableId": "",
    "version": "",
    "primaryKey": "ipd_patientid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "opd_ksapatientses": {
    "tableId": "",
    "version": "",
    "primaryKey": "opd_ksapatientsid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "opd_patients": {
    "tableId": "",
    "version": "",
    "primaryKey": "opd_patientid",
    "dataSourceType": "Dataverse",
    "apis": {}
  },
  "systemusers": {
    "tableId": "",
    "version": "",
    "primaryKey": "systemuserid",
    "dataSourceType": "Dataverse",
    "apis": {}
  }
};
