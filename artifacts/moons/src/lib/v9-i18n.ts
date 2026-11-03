// v9 화면 말 (0.2: 단어로). 뒤에 펼쳐서 예전 문구를 덮는다(용어 정리 2장).
export const v9Ko: Record<string, string> = {
  // 용어: 왜소행성 = 모행성 없는 페이지, 설명 전 = 내 말로 설명한 적 없는 개념
  'Dwarf Planet': '왜소행성', 'Dwarf planet': '왜소행성', 'None (Dwarf Planet)': '없음 (왜소행성)', 'Dwarf planets': '설명 전',
  'Choose 모행성. Leave empty for Dwarf Planet.': '모행성을 고르세요. 비워 두면 왜소행성이에요.', 'No topic': '왜소행성', 'Topic': '모행성', 'Topics': '모행성',
  'Never explained in your own words': '설명 전', 'Create 모행성': '모행성 만들기', 'Mother planet': '모행성', 'Mother planets': '모행성', 'Default planet': '기본 모행성',
  // 레일
  'Record': '기록', 'Learn': '학습', 'Space': 'Space', 'Share': '공유', 'Market': '마켓', 'Spaces': '공간', 'My Satellites': '내 Satellite', 'Satellite square': 'Satellite 광장', 'Planner': '플래너', 'MOONS home': 'MOONS 홈',
  // 기록 · 편집기
  'Recent pages': '최근 페이지', 'New page': '새 페이지', 'Hide list': '목록 접기', 'Show recent pages': '최근 페이지', 'All planets': '전체', 'Storage': '창고', 'Notes': '노트', 'Search': '검색', 'Untitled': '제목 없음',
  'Insert': '넣기', 'More': '더보기', 'Blocks': '블록', 'Structures': '내 구조', 'Keep on toolbar': '도구줄에 두기', 'Saving…': '저장 중…', 'Saved': '저장됨', 'Not saved': '저장 안 됨', 'Opening…': '여는 중…', 'Page not found.': '페이지를 찾을 수 없어요.',
  'Title': '제목', 'Heading': '제목', 'Text': '줄글', 'Write freely': '자유롭게 쓰기', 'Chat': '채팅', 'Table': '표', 'File': '파일', 'Link': '링크', 'Canvas': '캔버스', 'Card': '카드', 'Cloze': '빈칸', 'Question cards': '질문 카드',
  'Checklist': '체크리스트', 'Steps': '단계', 'Step': '단계', 'Timeline': '타임라인', 'Gallery': '갤러리', 'Fields': '칸', 'Field': '칸', 'Field name': '칸 이름', 'Status': '상태', 'Fix log': '해결 기록',
  'Error note': '오답 노트', 'Cornell note': '코넬 노트', 'Comparison table': '비교표', 'Error dump': '오답 덤프', 'Problem': '문항', 'Situation': '상황', 'Error': '오류', 'Reason': '이유', 'Fix': '해결', 'Cues': '단서', 'Summary': '요약', 'Criteria': '기준',
  'In what situation does this mistake happen?': '이 실수는 어떤 상황에서 나와요?', 'What would you check first next time?': '다음에는 무엇부터 확인할까요?',
  'Which problem was it?': '어떤 문항이었어요?', 'What was the situation?': '어떤 상황이었어요?', 'What went wrong?': '무엇이 어긋났어요?', 'Why do you think it happened?': '왜 그랬던 것 같아요?', 'What will you try next time?': '다음엔 어떻게 해볼까요?',
  'Unsolved': '미해결', 'Solving': '해결 중', 'Solved': '해결됨', 'Add fix': '해결 추가', 'Add': '추가', 'Delete': '삭제', 'Delete block': '블록 삭제', 'Move block': '옮기기', 'Drag to move': '끌어서 옮기기',
  'Column': '열', 'Column name': '열 이름', 'Add column': '열 추가', 'Row': '행', 'Delete row': '행 삭제', 'Item': '항목', 'Done': '완료', 'Date': '날짜', 'What happened': '내용',
  'Card front': '앞면', 'Card back': '뒷면', 'Back': '뒤로', 'Flip card': '뒤집기', 'Cloze text': '빈칸 글', 'Wrap words to hide in [[ ]]': '가릴 말을 [[ ]]로 감싸기', 'Hide again': '다시 가리기',
  'Question': '질문', 'Answer': '답', 'Go through': '넘겨보기', 'Edit': '고치기', 'Previous': '이전', 'Next': '다음',
  'Dump to MOONS': 'MOONS에게 덤프', 'Dump it here': '여기에 쏟아내기', 'Send': '보내기', 'Ask MOONS': 'MOONS에게 묻기',
  'Choose file': '파일', 'Uploading…': '올리는 중…', 'Upload failed.': '올리지 못했어요.', 'Add image': '이미지', 'Note': '메모', 'Connect': '잇기', 'Line name': '선 이름', 'Remove line': '선 지우기',
  'Record audio': '녹음', 'Stop recording': '녹음 끝', 'Recording': '녹음', 'Attach file': '파일', 'Add link': '링크', 'Add block': '블록', 'Highlight': '하이라이트', 'Bold': '굵게', 'Link address': '링크 주소',
  'Mine': '내 글', 'Source': '자료', 'Switch between my words and source': '내 글 · 자료 바꾸기',
  'Save structure': '구조 저장', 'Structure name': '구조 이름', 'Saved as my structure. It is on the toolbar now.': '내 구조로 저장했어요. 도구줄에 올렸어요.',
  'Delete page': '페이지 삭제', 'Delete this page? Snapshots already analysed stay.': '이 페이지를 지울까요? 이미 분석한 기록은 남아요.', 'This page changed on another device. Showing the latest.': '다른 기기에서 바뀌었어요. 최신 내용을 보여줘요.',
  'How sure are you?': '확신', '{n} out of 10': '10점 중 {n}', 'Add a child planet': '하위 모행성', 'Child of {name}': '{name} 아래', 'Planet name': '모행성 이름', 'New planet': '새 모행성', 'Auto': '자동', '{n} chosen': '{n}개', 'Save': '저장', 'Cancel': '취소',
  // 온보딩
  'Getting started': '시작', 'What do you record?': '무엇을 기록하나요?', 'First mother planets': '첫 모행성', 'Formats you will use often': '자주 쓸 형식', 'MOONS suggestions': 'MOONS 추천',
  'Formats · planets · connections': '형식 · 모행성 · 연결', 'On': '켜기', 'Off': '끄기', 'Skip': '건너뛰기', 'Start': '시작', 'Ready. Just start writing.': '바로 써 보세요.',
  'Study': '공부', 'Exam': '시험', 'Work': '일', 'Project': '프로젝트', 'Reading': '독서', 'Daily life': '일상', 'Language': '어학', 'Development': '개발',
};
Object.assign(v9Ko, {
  'My moon': '내 달', 'Based on my records': '내 기록 기준', 'Field list': '분야', 'Forming': '형성 중', 'evidence {n}': '근거 {n}', 'Structure': '구조', 'Compare': '비교', 'Original': '원문',
  'Places to look': '확인할 곳', 'Felt sure, not there yet': '확신과 어긋남', 'Know more than you think': '생각보다 앎', 'Never explained': '설명 전', 'Often, but low': '자주, 낮음', 'Not checked yet': '점검 전',
  'Back side · not checked yet': '뒷면 · 점검 전', '{n} kept only': '넣어두기만 한 것 {n}개', 'Concept': '개념', '{name} cross-section': '{name} 단면', 'Study tools': '학습 도구', 'Questions': '질문', 'Chats': '대화', 'Concepts': '개념',
  'You felt sure, but the records show a lower stage.': '확신에 비해 기록의 단계가 낮아요.', 'The records show more than you felt.': '느낀 것보다 기록이 더 많이 보여줘요.', 'Not yet explained in your own words.': '아직 내 말로 설명한 기록이 없어요.', 'No comparison, attempt or explanation yet.': '비교 · 풀이 · 설명 근거가 아직 없어요.',
  'Next place to look': '다음에 볼 곳', 'Chosen concept': '고른 개념', 'Actual stage': '실제 단계', 'Felt': '느낀 확신', 'Records': '쌓인 기록', 'page': '페이지 기준', 'Attempt': '풀이', 'Explained': '설명',
  'Explain {name} in your own words?': '{name}을(를) 내 말로 설명해 볼까요?', 'Where else would {name} apply?': '{name}을(를) 다른 곳에도 쓸 수 있을까요?', 'Explain': '설명',
  'This device cannot draw the 3D moon. The cross-section and lists below still work.': '이 기기에서는 3D 달을 그릴 수 없어요. 아래 단면도와 목록은 그대로 쓸 수 있어요.', 'My moon. Drag to turn it.': '내 달. 끌어서 돌릴 수 있어요.',
  'Front': '앞면', 'Back side': '뒷면', 'No concepts with records here yet.': '아직 개념이 없어요.', 'Cross-section: stage and confidence by concept': '개념별 단계와 확신 단면도',
  'Ground: stage': '땅 높이: 단계', 'Dashed: how sure you felt': '점선: 느낀 확신', 'Lower layer: records': '아래층: 쌓인 기록', 'Under water: not explained yet': '수면 아래: 설명 전',
  'Came in': '들어옴', 'Organised': '정리됨', 'Checked': '확인됨', 'Can explain': '설명 가능',
});
Object.assign(v9Ko, {
  'MOONS suggestion': 'MOONS 제안', 'Make it an error note?': '오답 노트로 바꿀까요?', 'Problem · situation · reason · next try are already here.': '문항 · 상황 · 이유 · 다음 시도가 이미 있어요.',
  'Put it on {name}?': '{name}에 둘까요?', 'Related planets to connect?': '관련 있는 행성을 더 연결해볼까요?', 'Connected.': '연결했어요.', 'Apply': '적용', 'Leave it': '그냥 두기', 'Close': '닫기',
});
Object.assign(v9Ko, {
  'Folder': '폴더', 'Folders': '폴더', 'Folder name': '폴더 이름', 'Web link': '웹 링크', 'Upload': '올리기', 'All': '전체', 'Rename': '이름 바꾸기', 'Name': '이름', 'Move': '옮기기', 'Open': '열기', 'Organize': '정리',
  'Delete this folder? Files move up one level.': '이 폴더를 지울까요? 파일은 한 단계 위로 옮겨져요.', 'Delete this file?': '이 파일을 지울까요?',
  'My structures': '내 구조', 'Make a shared space': '공유 공간 만들기', 'Toolbar': '도구줄', 'Built in': '기본', 'Copy': '복제', 'mine': '내 것', 'Move up': '앞으로', 'Remove': '빼기',
  'Delete this structure? Pages made with it stay.': '이 구조를 지울까요? 이걸로 만든 페이지는 남아요.', 'Copied. Insert it in a page, change it, then save structure again.': '복제했어요. 페이지에 넣어 고친 뒤 다시 구조 저장하세요.',
});
