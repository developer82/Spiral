import type { ComparisonScopeKey } from './comparison.types'

export interface ComparisonScopeOptionDefinition {
  key: ComparisonScopeKey
  labelKey: string
  descriptionKey: string
}

export interface ComparisonScopeGroupDefinition {
  id: 'schema' | 'data'
  titleKey: string
  descriptionKey: string
  options: ComparisonScopeOptionDefinition[]
}

export const COMPARISON_SCOPE_GROUPS: ComparisonScopeGroupDefinition[] = [
  {
    id: 'schema',
    titleKey: 'compare.scope.groups.schema.title',
    descriptionKey: 'compare.scope.groups.schema.description',
    options: [
      {
        key: 'schema.tablesCoreConstraints',
        labelKey: 'compare.scope.options.tablesCoreConstraints.label',
        descriptionKey: 'compare.scope.options.tablesCoreConstraints.description'
      },
      {
        key: 'schema.programmableObjects',
        labelKey: 'compare.scope.options.programmableObjects.label',
        descriptionKey: 'compare.scope.options.programmableObjects.description'
      },
      {
        key: 'schema.indexingSubsystems',
        labelKey: 'compare.scope.options.indexingSubsystems.label',
        descriptionKey: 'compare.scope.options.indexingSubsystems.description'
      },
      {
        key: 'schema.securityMetadataProfiles',
        labelKey: 'compare.scope.options.securityMetadataProfiles.label',
        descriptionKey: 'compare.scope.options.securityMetadataProfiles.description'
      }
    ]
  },
  {
    id: 'data',
    titleKey: 'compare.scope.groups.data.title',
    descriptionKey: 'compare.scope.groups.data.description',
    options: [
      {
        key: 'data.rowLevelValues',
        labelKey: 'compare.scope.options.rowLevelValues.label',
        descriptionKey: 'compare.scope.options.rowLevelValues.description'
      },
      {
        key: 'data.keyMatchedSets',
        labelKey: 'compare.scope.options.keyMatchedSets.label',
        descriptionKey: 'compare.scope.options.keyMatchedSets.description'
      }
    ]
  }
]