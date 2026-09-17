import type { ResponseFormat } from '../../sillytavern/api-router';
import { REVEAL_LEVELS } from './types';
import { SCENE_CRAFT_FOCUSES, SCENE_READER_EFFECTS } from './scene-craft';

const revealLevelSchema = { type: 'string', enum: [...REVEAL_LEVELS] };

export const DIRECTOR_PLAN_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['turnGoal', 'tone', 'beats', 'revelations', 'optionIntents', 'assetRequests'],
  properties: {
    turnGoal: { type: 'string' },
    tone: { type: 'string' },
    beats: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'purpose', 'description'],
        properties: {
          id: { type: 'string' },
          purpose: { type: 'string' },
          description: { type: 'string' },
          locationId: { type: 'string' },
          speakerIds: { type: 'array', items: { type: 'string' } },
          sourceMemoryIds: { type: 'array', items: { type: 'string' } },
          sourceBackgroundFactIds: { type: 'array', items: { type: 'string' } },
        },
      },
    },
    revelations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['factId', 'level', 'delivery'],
        properties: {
          factId: { type: 'string' },
          level: revealLevelSchema,
          delivery: { type: 'string', enum: ['narration', 'dialogue', 'object', 'environment'] },
          speakerId: { type: 'string' },
        },
      },
    },
    optionIntents: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'intent', 'tone', 'expectedPressure'],
        properties: {
          id: { type: 'string' },
          intent: { type: 'string' },
          tone: { type: 'string' },
          expectedPressure: { type: 'string', enum: ['low', 'medium', 'high'] },
          opportunityId: { type: 'string', minLength: 1 },
          scope: { type: 'string', enum: ['short', 'normal', 'deep'] },
        },
      },
    },
    assetRequests: { type: 'array', items: { type: 'string' } },
    sceneCraft: {
      type: 'object', additionalProperties: false, required: ['focus', 'beatIds'],
      properties: {
        focus: { type: 'string', enum: [...SCENE_CRAFT_FOCUSES] },
        readerEffect: { type: 'string', enum: [...SCENE_READER_EFFECTS] },
        beatIds: { type: 'array', minItems: 1, maxItems: 3, items: { type: 'string', minLength: 1, maxLength: 80 } },
      },
    },
    actionSteps: {
      type: 'array',
      minItems: 1,
      maxItems: 8,
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'kind', 'scope', 'locationId'],
        properties: {
          id: { type: 'string', minLength: 1 },
          kind: {
            type: 'string',
            enum: ['inquiry', 'investigation', 'search', 'travel', 'rest', 'wait'],
          },
          scope: { type: 'string', enum: ['short', 'normal', 'deep'] },
          locationId: { type: 'string', minLength: 1 },
        },
      },
    },
    scenePlan: {
      type: 'object',
      additionalProperties: false,
      required: ['observeFocus', 'investigateIntents', 'actionIntents'],
      properties: {
        observeFocus: { type: 'string' },
        observeConceal: { type: 'string' },
        investigateIntents: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['intent', 'costTier'],
            properties: {
              intent: { type: 'string' },
              suspectId: { type: 'string' },
              factId: { type: 'string' },
              costTier: { type: 'string', enum: ['light', 'medium', 'heavy'] },
              opportunityId: { type: 'string', minLength: 1 },
              scope: { type: 'string', enum: ['short', 'normal', 'deep'] },
            },
          },
        },
        actionIntents: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['intent', 'costTier'],
            properties: {
              intent: { type: 'string' },
              costTier: { type: 'string', enum: ['light', 'medium', 'heavy'] },
              opportunityId: { type: 'string', minLength: 1 },
              scope: { type: 'string', enum: ['short', 'normal', 'deep'] },
            },
          },
        },
      },
    },
    knowledgeEvents: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['eventId', 'evidence'],
        properties: {
          eventId: { type: 'string' },
          evidence: { type: 'string' },
        },
      },
    },
    backgroundFactProposals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['proposalId', 'text', 'characterIds', 'locationIds', 'knowerIds', 'evidenceText'],
        properties: {
          proposalId: { type: 'string' },
          text: { type: 'string' },
          characterIds: { type: 'array', items: { type: 'string' } },
          locationIds: { type: 'array', items: { type: 'string' } },
          knowerIds: { type: 'array', items: { type: 'string' } },
          evidenceText: { type: 'string' },
        },
      },
    },
    timeCostMinutes: { type: 'integer', minimum: 1, maximum: 180 },
  },
};

export const FACT_REVIEW_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['approved', 'violations', 'corrections'],
  properties: {
    approved: { type: 'boolean' },
    violations: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['code', 'message'],
        properties: {
          code: { type: 'string' },
          factId: { type: 'string' },
          message: { type: 'string' },
        },
      },
    },
    corrections: { type: 'array', items: { type: 'string' } },
  },
};

const narrativeAssertionSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['unitId', 'proposition', 'status', 'citations', 'reason'],
  properties: {
    unitId: { type: 'string', minLength: 1 },
    proposition: { type: 'string' },
    status: {
      type: 'string',
      enum: ['supported', 'unsupported', 'contradicted', 'question', 'hypothesis', 'ordinary-present'],
    },
    citations: {
      type: 'array',
      items: { type: 'string', minLength: 1 },
    },
    reason: { type: 'string' },
  },
};

const reviewedLineSpanSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['lineIndex', 'quote'],
  properties: {
    lineIndex: { type: 'integer', minimum: 0 },
    quote: { type: 'string', minLength: 1 },
  },
};

const characterContinuityAuditSchema: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['reviewed', 'disclosures', 'beliefs', 'commitments'],
  properties: {
    reviewed: { type: 'boolean', const: true },
    disclosures: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['assertionIndex', 'lineIndex', 'quote', 'listenerIds', 'audienceEvidence'],
        properties: {
          assertionIndex: { type: 'integer', minimum: 0 },
          lineIndex: { type: 'integer', minimum: 0 },
          quote: { type: 'string', minLength: 1 },
          listenerIds: { type: 'array', items: { type: 'string', minLength: 1 } },
          audienceEvidence: { type: 'array', items: reviewedLineSpanSchema },
        },
      },
    },
    beliefs: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['assertionIndex', 'observerId', 'status', 'evidence'],
        properties: {
          assertionIndex: { type: 'integer', minimum: 0 },
          observerId: { type: 'string', minLength: 1 },
          status: { type: 'string', enum: ['believed', 'suspected', 'inferred'] },
          evidence: { type: 'array', items: reviewedLineSpanSchema },
        },
      },
    },
    commitments: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        required: ['operation', 'actorId', 'recipientId', 'evidence'],
        properties: {
          operation: { type: 'string', enum: ['accept', 'fulfill', 'cancel'] },
          existingCommitmentId: { type: 'string', minLength: 1 },
          actorId: { type: 'string', minLength: 1 },
          recipientId: { type: 'string', minLength: 1 },
          evidence: { type: 'array', items: reviewedLineSpanSchema },
          action: { type: 'string', minLength: 1 },
          locationId: { type: 'string', minLength: 1 },
          dueAt: { type: 'string', minLength: 1 },
        },
      },
    },
  },
};

const actionAuditJudgmentProperties = {
  status: { type: 'string', enum: ['pass', 'fail', 'not-applicable'] },
  evidenceLineIndices: { type: 'array', items: { type: 'integer', minimum: 0 } },
  reason: { type: 'string', minLength: 1 },
};
const actionAuditJudgmentSchema = {
  type: 'object', additionalProperties: false, required: ['status', 'evidenceLineIndices', 'reason'],
  properties: actionAuditJudgmentProperties,
};
export const ACTION_AUDIT_JSON_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['originalRequest', 'followThrough', 'segments'],
  properties: {
    originalRequest: actionAuditJudgmentSchema,
    followThrough: actionAuditJudgmentSchema,
    segments: { type: 'array', items: {
      type: 'object', additionalProperties: false, required: ['segmentId', 'status', 'evidenceLineIndices', 'reason'],
      properties: { segmentId: { type: 'string' }, ...actionAuditJudgmentProperties },
    } },
  },
};

export const NARRATIVE_FACT_REVIEW_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['approved', 'violations', 'corrections', 'assertionAudit', 'continuityAudit', 'actionAudit'],
  properties: {
    ...(FACT_REVIEW_JSON_SCHEMA.properties as Record<string, unknown>),
    assertionAudit: {
      type: 'object',
      additionalProperties: false,
      required: ['assertions'],
      properties: {
        assertions: { type: 'array', items: narrativeAssertionSchema },
      },
    },
    continuityAudit: characterContinuityAuditSchema,
    actionAudit: { anyOf: [ACTION_AUDIT_JSON_SCHEMA, { type: 'null' }] },
  },
};

export const SCENE_CHECKLIST_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['observe', 'investigateItems', 'actionItems'],
  properties: {
    observe: { type: 'string' },
    investigateItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['desc', 'suspect', 'style', 'time', 'stamina', 'sanity'],
        properties: {
          desc: { type: 'string' },
          suspect: { type: 'string' },
          style: { type: 'string' },
          time: { type: 'string' },
          stamina: { type: 'number' },
          sanity: { type: 'number' },
        },
      },
    },
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['desc', 'style', 'time', 'stamina', 'sanity'],
        properties: {
          desc: { type: 'string' },
          style: { type: 'string' },
          time: { type: 'string' },
          stamina: { type: 'number' },
          sanity: { type: 'number' },
        },
      },
    },
  },
};

export const PROGRAM_SCENE_CHECKLIST_JSON_SCHEMA: Record<string, unknown> = {
  type: 'object',
  additionalProperties: false,
  required: ['observe', 'investigateItems', 'actionItems'],
  properties: {
    observe: { type: 'string' },
    investigateItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['actionId', 'desc', 'suspect', 'style'],
        properties: {
          actionId: { type: 'string', minLength: 1 },
          desc: { type: 'string' },
          suspect: { type: 'string' },
          style: { type: 'string' },
        },
      },
    },
    actionItems: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['actionId', 'desc', 'style'],
        properties: {
          actionId: { type: 'string', minLength: 1 },
          desc: { type: 'string' },
          style: { type: 'string' },
        },
      },
    },
  },
};

export const SCENE_CHECKLIST_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: { name: 'scene_checklist', strict: true, schema: SCENE_CHECKLIST_JSON_SCHEMA },
};

export const PROGRAM_SCENE_CHECKLIST_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'program_scene_checklist',
    strict: true,
    schema: PROGRAM_SCENE_CHECKLIST_JSON_SCHEMA,
  },
};

export const DIRECTOR_PLAN_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: { name: 'director_plan', strict: true, schema: DIRECTOR_PLAN_JSON_SCHEMA },
};

export const FACT_REVIEW_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: { name: 'fact_review', strict: true, schema: FACT_REVIEW_JSON_SCHEMA },
};

export const NARRATIVE_FACT_REVIEW_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'narrative_fact_review',
    strict: true,
    schema: NARRATIVE_FACT_REVIEW_JSON_SCHEMA,
  },
};

export const ACTION_AUDITED_NARRATIVE_FACT_REVIEW_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'narrative_fact_review', strict: true,
    schema: { ...NARRATIVE_FACT_REVIEW_JSON_SCHEMA,
      properties: { ...(NARRATIVE_FACT_REVIEW_JSON_SCHEMA.properties as Record<string, unknown>), actionAudit: ACTION_AUDIT_JSON_SCHEMA } },
  },
};
