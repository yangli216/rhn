package com.rhn.healthcore.mpi;

import com.rhn.healthcore.api.ResidentDirectory.ResidentSnapshot;
import com.rhn.shared.api.BusinessException;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.stream.LongStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.*;

class ResidentSnapshotBatchTest {
    final ResidentRepository repository = mock(ResidentRepository.class);
    final ResidentService service = new ResidentService(repository, null, null, null, null, null, null, null, null,
            null, null, null, null, null, null, null, null, null);

    Resident active(long id) {
        Resident value = mock(Resident.class);
        when(value.id()).thenReturn(id);
        when(value.status()).thenReturn(ResidentStatus.ACTIVE);
        when(value.healthRecordNo()).thenReturn("HR" + id);
        when(value.fullName()).thenReturn("name" + id);
        return value;
    }

    @Test
    void returnsSnapshotsMatchingSingleLookupAndPartitionsInQueries() {
        List<Long> ids = LongStream.rangeClosed(1, 1201).boxed().toList();
        Map<Long, Resident> entities = new java.util.HashMap<>();
        ids.forEach(id -> entities.put(id, active(id)));
        when(repository.findByTenantIdAndIdIn(anyLong(), any())).thenAnswer(invocation -> {
            Collection<Long> chunk = invocation.getArgument(1);
            return chunk.stream().map(entities::get).toList();
        });
        when(repository.findByIdAndTenantId(7L, 1L)).thenReturn(Optional.of(entities.get(7L)));

        Map<Long, ResidentSnapshot> result = service.requireSnapshots(1L, ids);

        assertEquals(1201, result.size());
        assertEquals(service.requireSnapshot(1L, 7L), result.get(7L));
        ArgumentCaptor<Collection<Long>> chunks = ArgumentCaptor.forClass(Collection.class);
        verify(repository, times(3)).findByTenantIdAndIdIn(eq(1L), chunks.capture());
        assertTrue(chunks.getAllValues().stream().allMatch(chunk -> chunk.size() <= 500));
    }

    @Test
    void missingIdThrowsSameNotFoundAsSingleLookup() {
        Resident one = active(1L);
        when(repository.findByTenantIdAndIdIn(anyLong(), any())).thenReturn(List.of(one));
        when(repository.findByIdAndTenantId(2L, 1L)).thenReturn(Optional.empty());
        BusinessException ex = assertThrows(BusinessException.class, () -> service.requireSnapshots(1L, List.of(1L, 2L)));
        assertEquals("RESIDENT_NOT_FOUND", ex.code());
    }

    @Test
    void emptyInputSkipsQuery() {
        assertTrue(service.requireSnapshots(1L, List.of()).isEmpty());
        verify(repository, never()).findByTenantIdAndIdIn(anyLong(), any());
    }
}
