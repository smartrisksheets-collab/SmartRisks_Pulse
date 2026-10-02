# app/schemas/matrix_config.py

from datetime import datetime
from pydantic import BaseModel, model_validator


class CeOption(BaseModel):
    value: int | None
    label: str


class MatrixConfigResponse(BaseModel):
    likelihood_scale:  int
    impact_scale:      int
    band_count:        int
    band_1_label:      str
    band_2_label:      str
    band_3_label:      str
    band_4_label:      str
    band_5_label:      str
    band_low_min:      int
    band_low_max:      int
    band_medium_min:   int
    band_medium_max:   int
    band_high_min:     int
    band_high_max:     int
    band_critical_min: int
    band_critical_max: int
    band_extreme_min:  int
    band_extreme_max:  int
    ce_scale:          int = 5
    ce_labels:         dict[str, str] = {}
    ce_scale_switch_enabled: bool = False
    ce_options:        list[CeOption] = []
    updated_at:        datetime | None = None

    model_config = {'from_attributes': True}


class MatrixConfigUpdate(BaseModel):
    likelihood_scale:  int
    impact_scale:      int
    band_count:        int
    band_1_label:      str
    band_2_label:      str
    band_3_label:      str
    band_4_label:      str
    band_5_label:      str
    band_low_min:      int
    band_low_max:      int
    band_medium_min:   int
    band_medium_max:   int
    band_high_min:     int
    band_high_max:     int
    band_critical_min: int
    band_critical_max: int
    band_extreme_min:  int
    band_extreme_max:  int

    @model_validator(mode='after')
    def validate_bands(self) -> 'MatrixConfigUpdate':
        max_sev = self.likelihood_scale * self.impact_scale
        bc = self.band_count

        if bc < 2 or bc > 5:
            raise ValueError('Band count must be between 2 and 5.')

        # Active band ranges in order
        all_bands = [
            (self.band_low_min,      self.band_low_max),
            (self.band_medium_min,   self.band_medium_max),
            (self.band_high_min,     self.band_high_max),
            (self.band_critical_min, self.band_critical_max),
            (self.band_extreme_min,  self.band_extreme_max),
        ]
        bands = all_bands[:bc]

        if bands[0][0] != 1:
            raise ValueError('First band must start at 1.')
        for i in range(len(bands) - 1):
            if bands[i][1] + 1 != bands[i + 1][0]:
                raise ValueError(f'Gap or overlap between band {i + 1} and band {i + 2}.')
        if bands[-1][1] != max_sev:
            raise ValueError(
                f'Last active band must end at {max_sev} '
                f'({self.likelihood_scale}x{self.impact_scale}, {bc} bands).'
            )
        return self


class MatrixConflictResponse(BaseModel):
    conflict_count: int
    message:        str


CE_LABEL_MAX = 40


class CeConfigUpdate(BaseModel):
    ce_scale:  int
    ce_labels: dict[str, str]
    confirm:   bool = False

    @model_validator(mode='after')
    def validate_ce(self) -> 'CeConfigUpdate':
        if self.ce_scale not in (4, 5):
            raise ValueError('Control effectiveness scale must be 4 or 5.')
        valid_keys = [str(i) for i in range(self.ce_scale + 1)]
        unknown = set(self.ce_labels) - set(valid_keys)
        if unknown:
            raise ValueError(f'Unknown control effectiveness level(s): {", ".join(sorted(unknown))}.')
        cleaned: dict[str, str] = {}
        seen: dict[str, str] = {}
        for key in valid_keys:
            label = self.ce_labels.get(key, '').strip()
            if len(label) > CE_LABEL_MAX:
                raise ValueError(f'Label for level {key} exceeds {CE_LABEL_MAX} characters.')
            if label.isdigit() and label != key:
                raise ValueError(f'Label for level {key} cannot be the number of another level.')
            effective = (label or key).casefold()
            if effective in seen:
                raise ValueError(f'Levels {seen[effective]} and {key} have the same label.')
            seen[effective] = key
            cleaned[key] = label
        self.ce_labels = cleaned
        return self


class CeBlockedRisk(BaseModel):
    risk_id:               str
    description:           str
    control_effectiveness: int


class CeScalePreview(BaseModel):
    current_scale:  int
    target_scale:   int
    affected_count: int
    blocked_count:  int
    blocked_risks:  list[CeBlockedRisk] = []