import { getDb } from "./client";

export function createSchema(): void {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS User (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('EDITOR','TEACHER','STUDENT')),
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Tenant (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS TenantMembership (
      id TEXT PRIMARY KEY,
      tenantId TEXT NOT NULL,
      userId TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('OWNER','ADMIN','TEACHER','STUDENT')),
      createdAt TEXT NOT NULL,
      UNIQUE(tenantId, userId),
      FOREIGN KEY(tenantId) REFERENCES Tenant(id) ON DELETE CASCADE,
      FOREIGN KEY(userId) REFERENCES User(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Book (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      subtitle TEXT NOT NULL,
      description TEXT NOT NULL,
      coverAssetId TEXT,
      ownerId TEXT NOT NULL,
      currentPublishedVersionId TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Chapter (
      id TEXT PRIMARY KEY,
      bookId TEXT NOT NULL,
      parentId TEXT,
      title TEXT NOT NULL,
      level INTEGER NOT NULL,
      sortOrder INTEGER NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(bookId) REFERENCES Book(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS DraftDocument (
      id TEXT PRIMARY KEY,
      chapterId TEXT NOT NULL UNIQUE,
      documentJson TEXT NOT NULL,
      plainText TEXT NOT NULL,
      revision INTEGER NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY(chapterId) REFERENCES Chapter(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS BookVersion (
      id TEXT PRIMARY KEY,
      bookId TEXT NOT NULL,
      versionNumber INTEGER NOT NULL,
      snapshotJson TEXT NOT NULL,
      note TEXT NOT NULL,
      publishedAt TEXT NOT NULL,
      UNIQUE(bookId, versionNumber),
      FOREIGN KEY(bookId) REFERENCES Book(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS Asset (
      id TEXT PRIMARY KEY,
      ownerId TEXT NOT NULL,
      kind TEXT NOT NULL,
      assetKey TEXT NOT NULL,
      originalName TEXT NOT NULL,
      mimeType TEXT NOT NULL,
      size INTEGER NOT NULL,
      relativePath TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      metadataJson TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      UNIQUE(assetKey)
    );

    CREATE TABLE IF NOT EXISTS Annotation (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      bookVersionId TEXT NOT NULL,
      chapterId TEXT NOT NULL,
      nodeId TEXT NOT NULL,
      quote TEXT NOT NULL,
      startOffset INTEGER NOT NULL,
      endOffset INTEGER NOT NULL,
      color TEXT NOT NULL,
      note TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS MindMapState (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      bookVersionId TEXT NOT NULL,
      mapJson TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(userId, bookVersionId)
    );

    CREATE TABLE IF NOT EXISTS ReadingState (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      bookVersionId TEXT NOT NULL,
      lastChapterId TEXT,
      lastNodeId TEXT,
      visitedChapterIdsJson TEXT NOT NULL,
      activeSeconds INTEGER NOT NULL,
      updatedAt TEXT NOT NULL,
      UNIQUE(userId, bookVersionId)
    );

    CREATE TABLE IF NOT EXISTS ActivityEvent (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      bookVersionId TEXT,
      classroomId TEXT,
      chapterId TEXT,
      nodeId TEXT,
      eventType TEXT NOT NULL,
      durationSeconds REAL,
      progress REAL,
      payloadJson TEXT,
      occurredAt TEXT NOT NULL,
      receivedAt TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ActivityEvent_user_idx ON ActivityEvent(userId, occurredAt);
    CREATE INDEX IF NOT EXISTS ActivityEvent_class_idx ON ActivityEvent(classroomId, occurredAt);

    CREATE TABLE IF NOT EXISTS AiConversation (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      bookVersionId TEXT NOT NULL,
      title TEXT NOT NULL,
      provider TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS AiMessage (
      id TEXT PRIMARY KEY,
      conversationId TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('USER','ASSISTANT')),
      content TEXT NOT NULL,
      citationsJson TEXT NOT NULL,
      provider TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      FOREIGN KEY(conversationId) REFERENCES AiConversation(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS AiConversation_user_idx ON AiConversation(userId, bookVersionId, updatedAt);
    CREATE INDEX IF NOT EXISTS AiMessage_conversation_idx ON AiMessage(conversationId, createdAt);

    CREATE TABLE IF NOT EXISTS ExperimentRun (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      bookVersionId TEXT NOT NULL,
      chapterId TEXT NOT NULL,
      nodeId TEXT NOT NULL,
      force REAL NOT NULL,
      mass REAL NOT NULL,
      acceleration REAL NOT NULL,
      samplesJson TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS QuizAttempt (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      bookVersionId TEXT NOT NULL,
      chapterId TEXT NOT NULL,
      nodeId TEXT NOT NULL,
      answersJson TEXT NOT NULL,
      score REAL NOT NULL,
      maxScore REAL NOT NULL,
      durationSeconds INTEGER NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS RecordingSubmission (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      bookVersionId TEXT NOT NULL,
      chapterId TEXT NOT NULL,
      nodeId TEXT NOT NULL,
      assetId TEXT NOT NULL,
      durationSeconds INTEGER NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Course (
      id TEXT PRIMARY KEY,
      teacherId TEXT NOT NULL,
      bookId TEXT NOT NULL,
      name TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Classroom (
      id TEXT PRIMARY KEY,
      courseId TEXT NOT NULL,
      name TEXT NOT NULL,
      joinCode TEXT NOT NULL UNIQUE,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS Enrollment (
      id TEXT PRIMARY KEY,
      classroomId TEXT NOT NULL,
      studentId TEXT NOT NULL,
      UNIQUE(classroomId, studentId)
    );

    CREATE TABLE IF NOT EXISTS LiveSession (
      id TEXT PRIMARY KEY,
      classroomId TEXT NOT NULL,
      status TEXT NOT NULL,
      currentChapterId TEXT,
      currentNodeId TEXT,
      startedAt TEXT NOT NULL,
      endedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS LiveQuizSession (
      id TEXT PRIMARY KEY,
      liveSessionId TEXT NOT NULL,
      quizNodeId TEXT NOT NULL,
      questionId TEXT NOT NULL,
      status TEXT NOT NULL,
      startedAt TEXT NOT NULL,
      endedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS LiveQuizResponse (
      id TEXT PRIMARY KEY,
      liveQuizSessionId TEXT NOT NULL,
      studentId TEXT NOT NULL,
      answerJson TEXT NOT NULL,
      isCorrect INTEGER NOT NULL,
      submittedAt TEXT NOT NULL,
      UNIQUE(liveQuizSessionId, studentId)
    );

    CREATE TABLE IF NOT EXISTS AttendanceSession (
      id TEXT PRIMARY KEY,
      classroomId TEXT NOT NULL,
      code TEXT NOT NULL,
      status TEXT NOT NULL,
      requireLocation INTEGER NOT NULL DEFAULT 0,
      latitude REAL,
      longitude REAL,
      radiusMeters INTEGER NOT NULL DEFAULT 0,
      expiresAt TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS AttendanceRecord (
      id TEXT PRIMARY KEY,
      attendanceSessionId TEXT NOT NULL,
      studentId TEXT NOT NULL,
      status TEXT NOT NULL,
      source TEXT NOT NULL,
      latitude REAL,
      longitude REAL,
      distanceMeters REAL,
      signedAt TEXT,
      UNIQUE(attendanceSessionId, studentId)
    );

    CREATE TABLE IF NOT EXISTS Assignment (
      id TEXT PRIMARY KEY,
      classroomId TEXT NOT NULL,
      teacherId TEXT NOT NULL,
      title TEXT NOT NULL,
      instructions TEXT NOT NULL,
      status TEXT NOT NULL,
      dueAt TEXT,
      sectionsJson TEXT NOT NULL,
      createdAt TEXT NOT NULL,
      publishedAt TEXT
    );

    CREATE TABLE IF NOT EXISTS AssignmentQuestion (
      id TEXT PRIMARY KEY,
      assignmentId TEXT NOT NULL,
      questionJson TEXT NOT NULL,
      sortOrder INTEGER NOT NULL,
      FOREIGN KEY(assignmentId) REFERENCES Assignment(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS AssignmentSubmission (
      id TEXT PRIMARY KEY,
      assignmentId TEXT NOT NULL,
      studentId TEXT NOT NULL,
      answersJson TEXT NOT NULL,
      textAnswer TEXT NOT NULL,
      score REAL,
      maxScore REAL NOT NULL,
      feedback TEXT NOT NULL,
      status TEXT NOT NULL,
      submittedAt TEXT NOT NULL,
      gradedAt TEXT,
      UNIQUE(assignmentId, studentId),
      FOREIGN KEY(assignmentId) REFERENCES Assignment(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS QuestionBankItem (
      id TEXT PRIMARY KEY,
      teacherId TEXT NOT NULL,
      source TEXT NOT NULL,
      questionJson TEXT NOT NULL,
      tagsJson TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS CourseResource (
      id TEXT PRIMARY KEY,
      courseId TEXT NOT NULL,
      assetId TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL,
      visibility TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS SimulationTemplateRun (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      templateKey TEXT NOT NULL,
      inputJson TEXT NOT NULL,
      resultJson TEXT NOT NULL,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS PlatformJob (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('READY','PROCESSING','DONE','FAILED')),
      attempts INTEGER NOT NULL,
      scheduledAt TEXT NOT NULL,
      lockedAt TEXT,
      completedAt TEXT,
      error TEXT,
      createdAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS BackupRecord (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size INTEGER NOT NULL,
      createdAt TEXT NOT NULL
    );
  `);
}

export function resetSchema(): void {
  const db = getDb();
  db.exec(`
    DROP TABLE IF EXISTS AttendanceRecord;
    DROP TABLE IF EXISTS AttendanceSession;
    DROP TABLE IF EXISTS BackupRecord;
    DROP TABLE IF EXISTS PlatformJob;
    DROP TABLE IF EXISTS SimulationTemplateRun;
    DROP TABLE IF EXISTS CourseResource;
    DROP TABLE IF EXISTS QuestionBankItem;
    DROP TABLE IF EXISTS AssignmentSubmission;
    DROP TABLE IF EXISTS AssignmentQuestion;
    DROP TABLE IF EXISTS Assignment;
    DROP TABLE IF EXISTS LiveQuizResponse;
    DROP TABLE IF EXISTS LiveQuizSession;
    DROP TABLE IF EXISTS LiveSession;
    DROP TABLE IF EXISTS Enrollment;
    DROP TABLE IF EXISTS Classroom;
    DROP TABLE IF EXISTS Course;
    DROP TABLE IF EXISTS RecordingSubmission;
    DROP TABLE IF EXISTS QuizAttempt;
    DROP TABLE IF EXISTS ExperimentRun;
    DROP TABLE IF EXISTS AiMessage;
    DROP TABLE IF EXISTS AiConversation;
    DROP TABLE IF EXISTS ActivityEvent;
    DROP TABLE IF EXISTS ReadingState;
    DROP TABLE IF EXISTS MindMapState;
    DROP TABLE IF EXISTS Annotation;
    DROP TABLE IF EXISTS Asset;
    DROP TABLE IF EXISTS BookVersion;
    DROP TABLE IF EXISTS DraftDocument;
    DROP TABLE IF EXISTS Chapter;
    DROP TABLE IF EXISTS Book;
    DROP TABLE IF EXISTS TenantMembership;
    DROP TABLE IF EXISTS Tenant;
    DROP TABLE IF EXISTS User;
  `);
  createSchema();
}
