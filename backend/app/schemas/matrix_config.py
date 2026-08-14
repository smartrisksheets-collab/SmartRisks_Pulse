# app/schemas/matrix_config.py

from datetime import datetime
from pydantic import BaseModel, model_validator


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