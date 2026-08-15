import type { ResponseFormat } from '../../sillytavern/api-router';
import { REVEAL_LEVELS } from './types';

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
        },
      },
    },
    assetRequests: { type: 'array', items: { type: 'string' } },
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

export const SCENE_CHECKLIST_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: { name: 'scene_checklist', strict: true, schema: SCENE_CHECKLIST_JSON_SCHEMA },
};

export const DIRECTOR_PLAN_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: { name: 'director_plan', strict: true, schema: DIRECTOR_PLAN_JSON_SCHEMA },
};

export const FACT_REVIEW_RESPONSE_FORMAT: ResponseFormat = {
  type: 'json_schema',
  json_schema: { name: 'fact_review', strict: true, schema: FACT_REVIEW_JSON_SCHEMA },
};
