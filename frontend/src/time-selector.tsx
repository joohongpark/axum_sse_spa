import React, { useState, useEffect, useRef } from 'react';

// 요일 배열 (원하는 순서대로)
const DAYS = {
    // 월 ~ 일 00:00 ~ 23:59 까지, 15분 단위의 시간표 타입
    monday: '월',
    tuesday: '화',
    wednesday: '수',
    thursday: '목',
    friday: '금',
    saturday: '토',
    sunday: '일',
};
// 24시간을 15분 단위로 나누면 96블록
const NUM_BLOCKS = 96;


// uuid에 따라 색상을 할당하는 간단한 함수
const getColorForUuid = (uuid: string) => {
    // 미리 정의된 색상 목록 (uuid의 인덱스에 따라 할당)
    const predefinedColors = [
        '#ffadad',
        '#ffd6a5',
        '#fdffb6',
        '#caffbf',
        '#9bf6ff',
        '#a0c4ff',
        '#bdb2ff',
        '#ffc6ff',
    ];
    // uuid의 첫번째 문자의 아스키 코드를 기반으로 색상을 선택
    const charCode = uuid.charCodeAt(0);
    return predefinedColors[charCode % predefinedColors.length];
};

// 여러 색상을 linear-gradient 형태로 만드는 함수
const generateGradient = (colors) => {
    if (colors.length === 0) return 'transparent';
    if (colors.length === 1) return colors[0];
    const step = 100 / colors.length;
    const stops = colors
        .map((color, i) => {
            const start = (i * step).toFixed(2);
            const end = ((i + 1) * step).toFixed(2);
            return `${color} ${start}%, ${color} ${end}%`;
        })
        .join(', ');
    return `linear-gradient(to right, ${stops})`;
};


const stringToGrid = (str: string) => {
    // 일/월/화/수/목/금/토/일 순서로 저장된 96개의 boolean 값을 0과 1로 표현한 문자열을 파싱
    // 예: "00000000000000000000....00000" (길이 96 * 7 = 672)
    const grid = {};
    const dayKeys = Object.keys(DAYS);
    for (let i = 0; i < dayKeys.length; i++) {
        const day = dayKeys[i];
        const start = i * NUM_BLOCKS;
        const end = start + NUM_BLOCKS;
        grid[day] = str.slice(start, end).split('').map(c => c === '1');
    }
    return grid;
}

const gridToString = (grid) => {
    return Object.keys(DAYS)
        .map(day => grid[day].map((b: boolean) => (b ? '1' : '0')).join(''))
        .join('');
}


// localhost 서버로 string 값 데이터를 전송하는 함수
const sendData = async (data) => {
    // const url = './time';
    const url = 'http://localhost:7777/time';
    await fetch(url, {
        method: 'POST',
        mode: 'cors',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
    });
};

// sse
const sse = async (uuid) => {
    // const url = `./sse/${uuid}`;
    const url = `http://localhost:7777/sse/${uuid}`;
    return await fetch(url, {
        method: 'GET',
        mode: 'cors',
        headers: {
            'Content-Type': 'application/json',
        },
    });
};


// uuid를 로컬스토리지에 저장 (이미 있으면 유지)
const uuid = localStorage.getItem('uuid') || crypto.randomUUID();

const TimeSelector = () => {
    const initialSchedules = {};

    Object.keys(DAYS).forEach(day => {
        initialSchedules[uuid] = initialSchedules[uuid] || {};
        initialSchedules[uuid][day] = Array(NUM_BLOCKS).fill(false);
    });
    const [schedules, setSchedules] = useState(initialSchedules);

    /**
     * 드래그 상태를 저장하는 state
     * dragState: { day, startIndex, initialValue, snapshot }
     * - day: 드래그 중인 요일(컬럼)
     * - startIndex: 드래그 시작 셀의 인덱스
     * - initialValue: 시작 셀의 기존 선택값 (true 또는 false)
     * - snapshot: 드래그 시작 전 해당 요일의 전체 셀 상태(복사본)
     */
    const [dragState, setDragState] = useState(null);
    const containerRef = useRef(null);

    const [uuids, setUuids] = useState([uuid]);

    // 마우스 다운 시 시작 셀 정보 저장
    const handleMouseDown = (day: string, index: number) => (e) => {
        e.preventDefault();
        const grid = schedules[uuid];
        const initialValue = grid[day][index];
        setDragState({ day, startIndex: index, initialValue });
    };

    // 마우스가 셀에 들어올 때, 드래그 중이면 시작 셀과 현재 셀 사이의 범위에 대해 선택 상태를 토글합니다.
    const handleMouseEnter = (day: string, index: number) => (e) => {
        e.preventDefault();
        if (!dragState || day !== dragState.day) return; // 드래그 중이 아니거나 다른 요일 드래그 시 무시

        // 드래그 시작 포인트, 드래그 중인 초기 셀 값, 셀 상태를 가져옴
        const { startIndex, initialValue } = dragState;
        const grid = schedules[uuid];
        const newGrid = { ...grid };
        // 우선 현재 상태를 가져온 후
        newGrid[day] = [...schedules[uuid][day]];
        // 시작 인덱스와 현재 인덱스 사이 (양 끝 포함)의 셀들을 토글 처리
        const start = Math.min(startIndex, index);
        const end = Math.max(startIndex, index);
        for (let i = start; i <= end; i++) {
            newGrid[day][i] = !initialValue;
        }
        const newSchedules = { ...schedules };
        newSchedules[uuid] = newGrid;
        setSchedules(newSchedules);
    };
    // 마우스 클릭시 셀 선택 상태 토글
    const handleMouseToggle = (day: string, index: number) => (e) => {
        e.preventDefault();
        const grid = schedules[uuid];
        const newGrid = { ...grid };
        newGrid[day] = [...grid[day]];
        newGrid[day][index] = !grid[day][index];
        const newSchedules = { ...schedules };
        newSchedules[uuid] = newGrid;
        setSchedules(newSchedules);
    }

    // 마우스 업 시 드래그 상태 초기화
    const handleMouseUp = (e) => {
        if (dragState) {
            setDragState(null);
        }
    };
    // --- 터치 이벤트 핸들러 ---

    const handleTouchStart = (day, index) => (e) => {
        e.preventDefault();
        const grid = schedules[uuid];
        const initialValue = grid[day][index];
        setDragState({ day, startIndex: index, initialValue });
    };

    const handleTouchMove = (e) => {
        e.preventDefault();
        if (!dragState) return;

        // 첫 번째 터치 포인트 정보 사용
        const touch = e.touches[0];
        // 터치 좌표를 기반으로 해당 요소 찾기
        const element = document.elementFromPoint(touch.clientX, touch.clientY);
        if (!element) return;
        // 각 셀에 부여한 data 속성을 통해 day, index 판별
        const day = element.getAttribute('data-day');
        const indexStr = element.getAttribute('data-index');
        if (day === null || indexStr === null) return;
        const index = parseInt(indexStr, 10);
        if (day !== dragState.day) return;

        const { startIndex, initialValue } = dragState;
        const grid = schedules[uuid];
        const newGrid = { ...grid };
        // 우선 현재 상태를 가져온 후
        newGrid[day] = [...schedules[uuid][day]];
        const start = Math.min(startIndex, index);
        const end = Math.max(startIndex, index);
        for (let i = start; i <= end; i++) {
            newGrid[day][i] = !initialValue;
        }
        const newSchedules = { ...schedules };
        newSchedules[uuid] = newGrid;
        setSchedules(newSchedules);
    };

    const handleTouchEnd = () => {
        if (dragState) {
            setDragState(null);
        }
    };


    // 전역적으로 마우스/터치 업 이벤트 처리 (터치가 영역 밖에서도 종료되도록)
    useEffect(() => {
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('touchend', handleTouchEnd);
        return () => {
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('touchend', handleTouchEnd);
        };
    }, [dragState]);

    useEffect(() => {
        setUuids([uuid]);
        const event = sse(uuid);

        // fetch 요청으로 SSE 스트림을 받아옴
        event
            .then((response) => {
                const reader = response.body!.getReader();
                const decoder = new TextDecoder("utf-8");
                let buffer = "";

                // 스트림을 계속 읽어들이는 재귀 함수
                const read = () => {
                    reader.read().then(({ done, value }) => {
                        if (done) {
                            console.log("스트림이 종료되었습니다.");
                            return;
                        }

                        // 받은 데이터를 텍스트로 디코딩하고 버퍼에 추가
                        buffer += decoder.decode(value, { stream: true });

                        // 이벤트는 보통 두 개의 개행(\n\n)으로 구분됨
                        const parts = buffer.split("\n\n");
                        // 마지막 부분은 불완전한 데이터일 수 있으므로 다시 버퍼에 저장
                        buffer = parts.pop()!;

                        parts.forEach((part) => {
                            // 각 이벤트의 각 줄을 처리
                            part.split("\n").forEach((line) => {
                                // data: 로 시작하는 줄을 JSON 파싱하여 처리
                                if (line.startsWith("data:")) {
                                    try {
                                        const data = line.substring(5).trim();
                                        if (data === "") return;
                                        const serverSchedules = data.split("|").map((str) => {
                                            const [uuid, grid] = str.split(":");
                                            return { uuid, grid: stringToGrid(grid) };
                                        }).reduce((acc, { uuid, grid }) => {
                                            acc[uuid] = grid;
                                            return acc;
                                        }, {});

                                        const newSchedules = { ...schedules };
                                        Object.keys(serverSchedules).forEach((uuid) => {
                                            newSchedules[uuid] = serverSchedules[uuid];
                                        });
                                        console.log({ schedules, serverSchedules, newSchedules });
                                        setSchedules(newSchedules);
                                        setUuids(Object.keys(newSchedules));
                                        // setGrid(grid);
                                    } catch (e) {
                                        console.error("파싱 에러:", e);
                                    }
                                }
                            });
                        });

                        // 다음 청크를 계속 읽음
                        read();
                    });
                };

                read();
            })
            .catch((error) => {
                console.error("Fetch 에러:", error);
            });
    }, []);

    useEffect(() => {
        if (!dragState) return;
        try {
            let sendSchedule = {};
            sendSchedule[uuid] = gridToString(schedules[uuid]);
            sendData(sendSchedule);
        } catch (e) {
            console.error(e);
        }
    }, [dragState, schedules[uuid]]);


    // (선택사항) 현재의 boolean 배열을 "연속 구간" (예: 00:00~15:00, 17:00~18:00)으로 변환하는 함수
    const getRanges = (day) => {
        const grid = schedules[uuid];
        const arr = grid[day];
        const ranges: { start: number, end: number }[] = [];
        let rangeStart: number | null = null;
        for (let i = 0; i < arr.length; i++) {
            if (arr[i]) {
                if (rangeStart === null) rangeStart = i;
            } else {
                if (rangeStart !== null) {
                    ranges.push({ start: rangeStart, end: i }); // end는 미포함 (즉, i*15분 까지)
                    rangeStart = null;
                }
            }
        }
        if (rangeStart !== null) {
            ranges.push({ start: rangeStart, end: arr.length });
        }
        return ranges;
    };

    // UI 렌더링
    return (
        <div
            className="time-selector-container"
            ref={containerRef}
            onTouchMove={handleTouchMove}  // 터치 이동 시 전체 컨테이너에서 이벤트 감지
            style={{ userSelect: 'none', touchAction: 'none', fontFamily: 'sans-serif' }}
        >
            <div style={{ display: 'flex' }}>
                {Object.keys(DAYS).map(day => (
                    <div
                        key={day}
                        className="day-column"
                        style={{
                            flex: 1,
                            border: '1px solid #ccc',
                            margin: '2px',
                            display: 'flex',
                            flexDirection: 'column'
                        }}
                    >
                        {/* 요일 레이블 */}
                        <div
                            style={{
                                textAlign: 'center',
                                borderBottom: '1px solid #ccc',
                                padding: '4px',
                                background: '#f0f0f0'
                            }}
                        >
                            {DAYS[day]}
                        </div>
                        {/* 96셀(15분 단위) 그리드 */}
                        <div className="time-grid" style={{ position: 'relative' }}>

                            {Array.from({ length: NUM_BLOCKS }).map((_, index) => {
                                // 해당 셀을 선택한 uuid 목록
                                const selectedUuids = uuids.filter(
                                    uuid => schedules[uuid] && schedules[uuid][day][index]
                                );
                                let background = '#fff';
                                if (selectedUuids.length === 1) {
                                    background = getColorForUuid(uuid);
                                } else if (selectedUuids.length > 1) {
                                    const colors = selectedUuids.map(uuid => getColorForUuid(uuid));
                                    background = generateGradient(colors);
                                }
                                const hours = Math.floor((index * 15) / 60);
                                const minutes = (index * 15) % 60;
                                const timeLabel = `${hours.toString().padStart(2, '0')}:${minutes
                                    .toString()
                                    .padStart(2, '0')}`;
                                return (
                                    <div
                                        key={index}
                                        data-day={day}
                                        data-index={index}
                                        style={{
                                            height: '20px',
                                            borderBottom: '1px solid #eee',
                                            background: background,
                                            position: 'relative',
                                        }}
                                        onMouseDown={handleMouseDown(day, index)}
                                        onMouseEnter={handleMouseEnter(day, index)}
                                        onTouchStart={handleTouchStart(day, index)}
                                        onClick={handleMouseToggle(day, index)}
                                    >
                                        {index % 4 === 0 && (
                                            <span
                                                style={{
                                                    fontSize: '10px',
                                                    position: 'absolute',
                                                    left: 2,
                                                    top: 0,
                                                }}
                                            >
                                                {timeLabel}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                        {/* (선택사항) 디버깅용: 현재 선택된 시간대 구간을 텍스트로 표시 */}
                        <div style={{ fontSize: '10px', padding: '4px', background: '#fafafa' }}>
                            {getRanges(day).length > 0 ? (
                                getRanges(day).map((range, idx) => {
                                    const startHour = Math.floor((range.start * 15) / 60);
                                    const startMin = (range.start * 15) % 60;
                                    const endHour = Math.floor((range.end * 15) / 60);
                                    const endMin = (range.end * 15) % 60;
                                    return (
                                        <div key={idx}>
                                            {`${startHour.toString().padStart(2, '0')}:${startMin
                                                .toString()
                                                .padStart(2, '0')} ~ ${endHour.toString().padStart(2, '0')}:${endMin
                                                    .toString()
                                                    .padStart(2, '0')}`}
                                        </div>
                                    );
                                })
                            ) : (
                                <div>선택된 구간 없음</div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default TimeSelector;